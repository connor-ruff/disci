"""Training plans: create (optionally from a pasted grid), edit week by week, switch the
active plan, and the calendar's plan vs. done by week."""

import datetime as dt
from collections import defaultdict
from decimal import Decimal
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.core.db import Db, DbDep
from app.modules.training import plans as rules
from app.modules.training.routes._common import invalid, not_found, today_and_week_start
from app.modules.training.schemas import (
    ActiveIn,
    CalendarOut,
    GridIn,
    GridOut,
    PlanCreate,
    PlanDayIn,
    PlanDaysIn,
    PlanDetail,
    PlanIn,
    PlanOut,
    PlanWeekEdit,
    PlanWeekIn,
    WeekOut,
)
from app.modules.training.service import clean_text
from app.modules.training.sql import queries

router = APIRouter()

ALL = {"date_from": None, "date_to": None}


def _plans(db: Db, plan_id: UUID | None = None, active_only: bool = False) -> list[PlanOut]:
    rows = db.conn.execute(
        queries["list_plans"], {"plan_id": plan_id, "active_only": active_only}
    ).fetchall()
    return [PlanOut.model_validate(r) for r in rows]


def _plan(db: Db, plan_id: UUID) -> PlanDetail:
    found = _plans(db, plan_id)
    if not found:
        raise not_found("plan")
    days = db.conn.execute(queries["list_plan_days"], {"plan_id": plan_id, **ALL}).fetchall()
    weeks = db.conn.execute(queries["list_plan_weeks"], {"plan_id": plan_id, **ALL}).fetchall()
    return PlanDetail.model_validate({**found[0].model_dump(), "days": days, "weeks": weeks})


def _lock(db: Db, plan_id: UUID) -> None:
    if db.conn.execute(queries["lock_plan"], {"plan_id": plan_id}).fetchone() is None:
        raise not_found("plan")


def _details(body: PlanIn) -> dict[str, Any]:
    name = body.name.strip()
    if not name:
        raise invalid("name can't be blank")
    return {
        "name": name,
        "race_name": clean_text(body.race_name),
        "race_on": body.race_on,
        "starts_on": body.starts_on,
        "count_walk_miles": body.count_walk_miles,
        "cross_train_at_pct": body.cross_train_at_pct,
    }


def _no_repeats(days: list[PlanDayIn]) -> None:
    seen = {d.day_on for d in days}
    if len(seen) != len(days):
        raise invalid("a day is listed more than once")


def _insert_days(db: Db, plan_id: UUID, days: list[PlanDayIn]) -> None:
    for d in days:
        db.conn.execute(
            queries["insert_plan_day"],
            {
                "user_id": db.user_id,
                "plan_id": plan_id,
                "day_on": d.day_on,
                "planned_miles": d.planned_miles,
                "notes": clean_text(d.notes),
            },
        )


def _insert_weeks(db: Db, plan_id: UUID, weeks: list[PlanWeekIn]) -> None:
    for w in weeks:
        db.conn.execute(
            queries["insert_plan_week"],
            {
                "user_id": db.user_id,
                "plan_id": plan_id,
                "week_starts_on": w.week_starts_on,
                "target_miles": w.target_miles,
            },
        )


@router.post("/plans/grid")
def read_grid(body: GridIn) -> GridOut:
    """Reads a pasted plan grid (week start date, then Monday..Sunday miles) without saving
    anything: the days it found, and the rows and cells it couldn't read."""
    grid = rules.parse_grid(body.text)
    return GridOut(
        days=[vars(d) for d in grid.days],  # type: ignore[misc]
        weeks=grid.weeks,
        total_miles=sum((d.planned_miles for d in grid.days), Decimal(0)),
        skipped=grid.skipped,
    )


@router.get("/plans")
def list_plans(db: DbDep) -> list[PlanOut]:
    """Every plan, the active one first, then newest first."""
    return _plans(db)


@router.post("/plans", status_code=status.HTTP_201_CREATED)
def create_plan(body: PlanCreate, db: DbDep) -> PlanDetail:
    """Creates a plan with its days and weekly targets. With `active` (the default) it
    becomes the active plan and any other plan stops being active."""
    details = _details(body)
    _no_repeats(body.days)
    if len({w.week_starts_on for w in body.weeks}) != len(body.weeks):
        raise invalid("a week is listed more than once")
    if body.active:
        db.conn.execute(queries["deactivate_plans"])
    row = db.conn.execute(
        queries["insert_plan"], {"user_id": db.user_id, "is_active": body.active, **details}
    ).fetchone()
    if row is None:
        raise RuntimeError("INSERT ... RETURNING returned no row")
    _insert_days(db, row["id"], body.days)
    _insert_weeks(db, row["id"], body.weeks)
    return _plan(db, row["id"])


@router.get("/plans/{plan_id}")
def get_plan(plan_id: UUID, db: DbDep) -> PlanDetail:
    return _plan(db, plan_id)


@router.put("/plans/{plan_id}")
def update_plan(plan_id: UUID, body: PlanIn, db: DbDep) -> PlanDetail:
    """Replaces the plan's details and rule settings. Its days and weeks don't change."""
    details = _details(body)
    if db.conn.execute(queries["update_plan"], {"plan_id": plan_id, **details}).fetchone() is None:
        raise not_found("plan")
    return _plan(db, plan_id)


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(plan_id: UUID, db: DbDep) -> None:
    """Soft delete. Workouts are untouched (they never belong to a plan)."""
    if db.conn.execute(queries["delete_plan"], {"plan_id": plan_id}).fetchone() is None:
        raise not_found("plan")


@router.put("/plans/{plan_id}/active")
def set_active(plan_id: UUID, body: ActiveIn, db: DbDep) -> PlanDetail:
    """Makes the plan the active one (any other stops being active), or not active."""
    _lock(db, plan_id)
    if body.active:
        db.conn.execute(queries["deactivate_plans"])
    db.conn.execute(queries["set_plan_active"], {"plan_id": plan_id, "active": body.active})
    return _plan(db, plan_id)


@router.put("/plans/{plan_id}/days")
def replace_days(plan_id: UUID, body: PlanDaysIn, db: DbDep) -> PlanDetail:
    """Replaces every planned day (e.g. re-importing the sheet). Weekly targets stay."""
    _lock(db, plan_id)
    _no_repeats(body.days)
    db.conn.execute(queries["delete_plan_days"], {"plan_id": plan_id, **ALL})
    _insert_days(db, plan_id, body.days)
    return _plan(db, plan_id)


@router.put("/plans/{plan_id}/weeks/{starts_on}")
def edit_week(plan_id: UUID, starts_on: dt.date, body: PlanWeekEdit, db: DbDep) -> PlanDetail:
    """Replaces one week (`starts_on` + 6 days): its planned days and its target."""
    _lock(db, plan_id)
    ends_on = starts_on + dt.timedelta(days=6)
    if any(not starts_on <= d.day_on <= ends_on for d in body.days):
        raise invalid("every day must fall inside the week")
    _no_repeats(body.days)
    week = {"plan_id": plan_id, "date_from": starts_on, "date_to": ends_on}
    db.conn.execute(queries["delete_plan_days"], week)
    db.conn.execute(queries["delete_plan_weeks"], week)
    _insert_days(db, plan_id, body.days)
    if body.target_miles is not None:
        _insert_weeks(
            db, plan_id, [PlanWeekIn(week_starts_on=starts_on, target_miles=body.target_miles)]
        )
    return _plan(db, plan_id)


@router.get("/weeks")
def plan_vs_done(
    db: DbDep,
    start: Annotated[dt.date, Query(description="First day of the range.")],
    end: Annotated[dt.date, Query(description="Last day of the range.")],
) -> CalendarOut:
    """Plan vs. done for every week overlapping the range (weeks start on the user's
    week_starts_on): target, band, miles done, runs, status and the cross-training cue,
    plus the active plan's days in the range. Works without a plan (status `none`)."""
    if end < start or (end - start).days > 400:
        raise invalid("the range must be at most 400 days, end on or after start")
    today, week_starts_on = today_and_week_start(db)
    first = rules.week_start(start, week_starts_on)
    last = rules.week_start(end, week_starts_on) + dt.timedelta(days=6)
    active = _plans(db, active_only=True)
    plan = active[0] if active else None

    by_day: dict[dt.date, list[dict[str, Any]]] = defaultdict(list)
    for w in db.conn.execute(
        queries["list_workout_miles"], {"date_from": first, "date_to": last}
    ).fetchall():
        by_day[w["date"]].append(w)
    days: list[dict[str, Any]] = []
    targets: dict[dt.date, Decimal] = {}
    if plan:
        span = {"plan_id": plan.id, "date_from": first, "date_to": last}
        days = db.conn.execute(queries["list_plan_days"], span).fetchall()
        targets = {
            w["week_starts_on"]: w["target_miles"]
            for w in db.conn.execute(queries["list_plan_weeks"], span).fetchall()
        }
    planned: dict[dt.date, list[Decimal]] = defaultdict(list)
    for d in days:
        planned[rules.week_start(d["day_on"], week_starts_on)].append(d["planned_miles"])

    weeks = []
    week = first
    while week <= last:
        span_days = [week + dt.timedelta(days=i) for i in range(7)]
        score = rules.score_week(
            week,
            today=today,
            planned=planned[week],
            set_target=targets.get(week),
            workouts=[w for d in span_days for w in by_day[d]],
            count_walk_miles=plan.count_walk_miles if plan else False,
            cross_train_at_pct=plan.cross_train_at_pct if plan else 90,
            has_plan=plan is not None,
        )
        weeks.append(WeekOut.model_validate(vars(score)))
        week += dt.timedelta(days=7)

    return CalendarOut(
        today=today,
        plan=plan,
        days_to_race=(plan.race_on - today).days if plan and plan.race_on else None,
        days=[d for d in days if start <= d["day_on"] <= end],  # type: ignore[misc]
        weeks=weeks,
    )
