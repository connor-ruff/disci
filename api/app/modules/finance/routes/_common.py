from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from psycopg import Connection, errors

from app.core.db import Db
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
