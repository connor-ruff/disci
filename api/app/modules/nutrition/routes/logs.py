from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.core.db import Db, DbDep
from app.modules.nutrition import service
from app.modules.nutrition.routes._common import not_found
from app.modules.nutrition.schemas import DayOut, DaySummary, LogCreate, LogOut, LogUpdate
from app.modules.nutrition.sql import queries

router = APIRouter()


def _log_out(row) -> LogOut:
    return LogOut.model_validate({**row, "nutrients": service.entry_nutrients(row)})


def _entries_by_day(db: Db, days: list[date]) -> dict[date, list[LogOut]]:
    by_day: dict[date, list[LogOut]] = {d: [] for d in days}
    for row in db.conn.execute(queries["list_logs_for_days"], {"days": days}).fetchall():
        by_day[row["eaten_on"]].append(_log_out(row))
    return by_day


def _totals(entries: list[LogOut]):
    return service.day_totals([(e.food_name, e.nutrients) for e in entries])


@router.get("/days")
def list_days(
    db: DbDep,
    before: date | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> list[DaySummary]:
    """Days with something logged, newest first. Page with `before` = the last date seen."""
    rows = db.conn.execute(
        queries["list_logged_days"], {"before": before, "limit": limit}
    ).fetchall()
    days = [r["eaten_on"] for r in rows]
    by_day = _entries_by_day(db, days)
    return [DaySummary(date=d, entry_count=len(by_day[d]), totals=_totals(by_day[d])) for d in days]


@router.get("/days/{day}")
def get_day(day: date, db: DbDep) -> DayOut:
    """One day's food sheet: its entries (oldest first) and per-nutrient totals."""
    entries = _entries_by_day(db, [day])[day]
    return DayOut(date=day, entries=entries, totals=_totals(entries))


def _log(db: Db, log_id: UUID) -> LogOut:
    row = db.conn.execute(queries["get_log"], {"log_id": log_id}).fetchone()
    if row is None:
        raise not_found("log entry")
    return _log_out(row)


@router.post("/logs", status_code=status.HTTP_201_CREATED)
def create_log(body: LogCreate, db: DbDep) -> LogOut:
    row = db.conn.execute(
        queries["insert_log"], {"user_id": db.user_id, **body.model_dump()}
    ).fetchone()
    if row is None:
        raise not_found("food")
    return _log(db, row["id"])


@router.put("/logs/{log_id}")
def update_log(log_id: UUID, body: LogUpdate, db: DbDep) -> LogOut:
    row = db.conn.execute(queries["update_log"], {"log_id": log_id, **body.model_dump()}).fetchone()
    if row is None:
        raise not_found("log entry")
    return _log(db, log_id)


@router.delete("/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_log(log_id: UUID, db: DbDep) -> None:
    if db.conn.execute(queries["delete_log"], {"log_id": log_id}).fetchone() is None:
        raise not_found("log entry")
