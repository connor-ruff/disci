"""Helpers shared by the training route files."""

import datetime as dt
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from psycopg import Connection, errors

from app.core.db import Db
from app.modules.training.sql import queries


def not_found(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def invalid(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail)


@contextmanager
def unique_errors(conn: Connection[Any], detail: str) -> Iterator[None]:
    """Turns a unique violation into a 409. The savepoint keeps the request usable."""
    try:
        with conn.transaction():
            yield
    except errors.UniqueViolation as e:
        raise HTTPException(status.HTTP_409_CONFLICT, detail) from e


def today_for(db: Db) -> dt.date:
    """Today in the user's timezone."""
    row = db.conn.execute(queries["get_user_prefs"], {"user_id": db.user_id}).fetchone()
    return dt.datetime.now(ZoneInfo(row["timezone"] if row else "UTC")).date()


def today_and_week_start(db: Db) -> tuple[dt.date, int]:
    """Today in the user's timezone, and the ISO weekday their weeks start on."""
    row = db.conn.execute(queries["get_user_prefs"], {"user_id": db.user_id}).fetchone()
    tz = row["timezone"] if row else "UTC"
    return dt.datetime.now(ZoneInfo(tz)).date(), row["week_starts_on"] if row else 1
