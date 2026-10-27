from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from psycopg import Connection, errors

from app.core.db import Db
from app.modules.finance import service
from app.modules.finance.schemas import AllocationIn
from app.modules.finance.sql import queries


def not_found(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def invalid(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail)


@contextmanager
def constraint_errors(conn: Connection[Any]) -> Iterator[None]:
    """Turns constraint violations into 4xx responses instead of 500s.

    The savepoint keeps the request's transaction usable after the failed statement.
    """
    try:
        with conn.transaction():
            yield
    except errors.UniqueViolation as e:
        raise HTTPException(status.HTTP_409_CONFLICT, "already exists") from e
    except errors.ForeignKeyViolation as e:
        # e.g. an expense item pointed at an income category, or an unknown category
        raise invalid("category doesn't exist or doesn't match the item's kind") from e


def user_prefs(db: Db) -> tuple[str, int]:
    """The user's (timezone, week_starts_on)."""
    row = db.conn.execute(queries["get_user_prefs"], {"user_id": db.user_id}).fetchone()
    return (row["timezone"], row["week_starts_on"]) if row else ("UTC", 1)


def today_in(timezone: str) -> date:
    return datetime.now(ZoneInfo(timezone)).date()


def write_allocations(db: Db, transaction_id: UUID, amount, allocations: list[AllocationIn]):
    """Validates and inserts allocations for a transaction (replacing none)."""
    item_ids = [a.budget_item_id for a in allocations]
    rows = db.conn.execute(queries["get_item_budgets"], {"item_ids": item_ids}).fetchall()
    error = service.allocation_errors(amount, allocations, {r["id"]: r["budget_id"] for r in rows})
    if error:
        raise invalid(error)
    with db.conn.cursor() as cur:
        cur.executemany(
            queries["insert_allocation"],
            [
                {"user_id": db.user_id, "transaction_id": transaction_id, **a.model_dump()}
                for a in allocations
            ],
        )
