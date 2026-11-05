"""The workout log: workouts, recent locations and the lift catalog."""

import datetime as dt
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.core.db import Db, DbDep
from app.modules.training import service
from app.modules.training.routes._common import invalid, not_found, today_for, unique_errors
from app.modules.training.schemas import (
    LiftDetail,
    LiftIn,
    LiftOut,
    SetIn,
    WorkoutIn,
    WorkoutOut,
    WorkoutType,
)
from app.modules.training.sql import queries

router = APIRouter()


# ---------------------------------------------------------------------------
# Workouts
# ---------------------------------------------------------------------------


def _with_sets(db: Db, rows: list[dict[str, Any]]) -> list[WorkoutOut]:
    """Attaches each workout's sets (one query for all of them) and its pace."""
    sets: dict[UUID, list[dict[str, Any]]] = {r["id"]: [] for r in rows}
    lift_ids = [r["id"] for r in rows if r["type"] == "lift"]
    if lift_ids:
        for s in db.conn.execute(queries["list_sets"], {"workout_ids": lift_ids}).fetchall():
            sets[s["workout_id"]].append(s)
    return [
        WorkoutOut.model_validate(
            {**r, "sets": sets[r["id"]], "pace_sec_per_mile": service.pace(r)}
        )
        for r in rows
    ]


def _workout(db: Db, workout_id: UUID) -> WorkoutOut:
    row = db.conn.execute(queries["get_workout"], {"workout_id": workout_id}).fetchone()
    if row is None:
        raise not_found("workout")
    return _with_sets(db, [row])[0]


def _fields(db: Db, body: WorkoutIn) -> dict[str, Any]:
    """The workout's columns, validated against its type. Defaults the date to today."""
    try:
        service.check_fields(body)
    except ValueError as e:
        raise invalid(str(e)) from e
    today = today_for(db)
    day = body.date or today
    if day > today:
        raise invalid("can't log a workout in the future")
    fields = body.model_dump(exclude={"sets"})
    for key in ("location", "description", "reflection"):
        fields[key] = service.clean_text(fields[key])
    fields["date"] = day
    return fields


def _lift_id(db: Db, s: SetIn, by_name: dict[str, UUID]) -> UUID:
    """The set's lift: by id (must exist), or by name (found or added to the catalog)."""
    if s.lift_id is not None:
        if db.conn.execute(queries["get_lift"], {"lift_id": s.lift_id}).fetchone() is None:
            raise invalid("lift doesn't exist")
        return s.lift_id
    name = (s.lift_name or "").strip()
    key = name.lower()
    if key not in by_name:
        row = db.conn.execute(queries["find_lift_by_name"], {"name": name}).fetchone()
        if row is None:
            row = db.conn.execute(
                queries["insert_lift"], {"user_id": db.user_id, "name": name, "description": None}
            ).fetchone()
        if row is None:
            raise RuntimeError("INSERT ... RETURNING returned no row")
        by_name[key] = row["id"]
    return by_name[key]


def _write_sets(db: Db, workout_id: UUID, sets: list[SetIn]) -> None:
    """Replaces the workout's sets, numbered 1, 2, 3… in the order given."""
    db.conn.execute(queries["delete_workout_sets"], {"workout_id": workout_id})
    by_name: dict[str, UUID] = {}
    for number, s in enumerate(sets, start=1):
        db.conn.execute(
            queries["insert_lift_set"],
            {
                "user_id": db.user_id,
                "workout_id": workout_id,
                "lift_id": _lift_id(db, s, by_name),
                "set_number": number,
                "reps": s.reps,
                "weight_num": s.weight_num,
            },
        )


@router.get("/workouts")
def list_workouts(
    db: DbDep,
    start: Annotated[dt.date | None, Query(description="On or after this day.")] = None,
    end: Annotated[dt.date | None, Query(description="On or before this day.")] = None,
    type: WorkoutType | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[WorkoutOut]:
    """Workouts with their sets, newest first."""
    rows = db.conn.execute(
        queries["list_workouts"],
        {
            "date_from": start,
            "date_to": end,
            "type": type,
            "limit": limit,
            "offset": offset,
        },
    ).fetchall()
    return _with_sets(db, rows)


@router.post("/workouts", status_code=status.HTTP_201_CREATED)
def create_workout(body: WorkoutIn, db: DbDep) -> WorkoutOut:
    fields = _fields(db, body)
    row = db.conn.execute(queries["insert_workout"], {"user_id": db.user_id, **fields}).fetchone()
    if row is None:
        raise RuntimeError("INSERT ... RETURNING returned no row")
    _write_sets(db, row["id"], body.sets)
    return _workout(db, row["id"])


@router.get("/workouts/{workout_id}")
def get_workout(workout_id: UUID, db: DbDep) -> WorkoutOut:
    return _workout(db, workout_id)


@router.put("/workouts/{workout_id}")
def update_workout(workout_id: UUID, body: WorkoutIn, db: DbDep) -> WorkoutOut:
    """Replaces the workout, sets included. Its type may change (a lift's sets go with it)."""
    if db.conn.execute(queries["lock_workout"], {"workout_id": workout_id}).fetchone() is None:
        raise not_found("workout")
    fields = _fields(db, body)
    # Sets first: they pin the workout's type to 'lift' until they're gone.
    db.conn.execute(queries["delete_workout_sets"], {"workout_id": workout_id})
    db.conn.execute(queries["update_workout"], {"workout_id": workout_id, **fields})
    _write_sets(db, workout_id, body.sets)
    return _workout(db, workout_id)


@router.delete("/workouts/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workout(workout_id: UUID, db: DbDep) -> None:
    if db.conn.execute(queries["delete_workout"], {"workout_id": workout_id}).fetchone() is None:
        raise not_found("workout")


@router.get("/locations")
def list_locations(db: DbDep, limit: Annotated[int, Query(ge=1, le=50)] = 10) -> list[str]:
    """Locations used before, most recently used first (suggestions for the log form)."""
    rows = db.conn.execute(queries["list_locations"], {"limit": limit}).fetchall()
    return [r["location"] for r in rows]


# ---------------------------------------------------------------------------
# Lifts (the catalog)
# ---------------------------------------------------------------------------


def _lift_fields(body: LiftIn) -> dict[str, Any]:
    name = body.name.strip()
    if not name:
        raise invalid("name can't be blank")
    return {"name": name, "description": service.clean_text(body.description)}


def _lift(db: Db, lift_id: UUID) -> LiftOut:
    row = db.conn.execute(queries["list_lifts"], {"lift_id": lift_id}).fetchone()
    if row is None:
        raise not_found("lift")
    return LiftOut.model_validate(row)


@router.get("/lifts")
def list_lifts(db: DbDep) -> list[LiftOut]:
    """The catalog, most recently done first, each with what was done last time."""
    rows = db.conn.execute(queries["list_lifts"], {"lift_id": None}).fetchall()
    return [LiftOut.model_validate(r) for r in rows]


@router.post("/lifts", status_code=status.HTTP_201_CREATED)
def create_lift(body: LiftIn, db: DbDep) -> LiftOut:
    fields = _lift_fields(body)
    with unique_errors(db.conn, "a lift with that name already exists"):
        row = db.conn.execute(queries["insert_lift"], {"user_id": db.user_id, **fields}).fetchone()
    if row is None:
        raise RuntimeError("INSERT ... RETURNING returned no row")
    return _lift(db, row["id"])


@router.get("/lifts/{lift_id}")
def get_lift(lift_id: UUID, db: DbDep) -> LiftDetail:
    """The lift, last time, and its sets in each workout it was in (newest first)."""
    lift = _lift(db, lift_id)
    rows = db.conn.execute(queries["lift_history"], {"lift_id": lift_id, "limit": 50}).fetchall()
    return LiftDetail.model_validate({**lift.model_dump(), "sessions": rows})


@router.put("/lifts/{lift_id}")
def update_lift(lift_id: UUID, body: LiftIn, db: DbDep) -> LiftOut:
    fields = _lift_fields(body)
    with unique_errors(db.conn, "a lift with that name already exists"):
        row = db.conn.execute(queries["update_lift"], {"lift_id": lift_id, **fields}).fetchone()
    if row is None:
        raise not_found("lift")
    return _lift(db, lift_id)


@router.delete("/lifts/{lift_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lift(lift_id: UUID, db: DbDep) -> None:
    """Soft delete: past workouts keep showing its sets under its name."""
    if db.conn.execute(queries["delete_lift"], {"lift_id": lift_id}).fetchone() is None:
        raise not_found("lift")
