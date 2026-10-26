from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from psycopg import Connection, errors

from app.core.db import Db
from app.modules.nutrition.sql import queries


def not_found(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


@contextmanager
def unique_errors(conn: Connection[Any], detail: str) -> Iterator[None]:
    """Turns a unique violation into a 409. The savepoint keeps the request usable."""
    try:
        with conn.transaction():
            yield
    except errors.UniqueViolation as e:
        raise HTTPException(status.HTTP_409_CONFLICT, detail) from e


def today_for(db: Db) -> date:
    """Today in the user's timezone."""
    row = db.conn.execute(queries["get_user_prefs"], {"user_id": db.user_id}).fetchone()
    return datetime.now(ZoneInfo(row["timezone"] if row else "UTC")).date()
