"""Tasks HTTP routes, mounted at /tasks."""

from datetime import date, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, status

from app.core.db import Db, DbDep
from app.modules.tasks import service
from app.modules.tasks.schemas import (
    CheckIn,
    CompletionOut,
    DayCompletionOut,
    TaskCreate,
    TaskDetail,
    TaskOut,
    TaskUpdate,
    TypeOut,
)
from app.modules.tasks.sql import queries

router = APIRouter()


def not_found(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def invalid(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail)


def today_for(db: Db) -> date:
    """Today in the user's timezone."""
    row = db.conn.execute(queries["get_user_prefs"], {"user_id": db.user_id}).fetchone()
    return datetime.now(ZoneInfo(row["timezone"] if row else "UTC")).date()


def _task(db: Db, task_id: UUID, day: date) -> TaskOut:
    row = db.conn.execute(queries["get_task"], {"task_id": task_id, "day": day}).fetchone()
    if row is None:
        raise not_found("task")
    return TaskOut.model_validate(service.progress(row, day))


def _fields(task_type, body) -> dict:
    try:
        fields = service.type_fields(task_type, body.model_dump(exclude={"task_type"}))
    except ValueError as e:
        raise invalid(str(e)) from e
    fields["name"] = fields["name"].strip()
    return fields


@router.get("/types")
def list_types() -> list[TypeOut]:
    """The four task types, what each is for and how it behaves."""
    return [TypeOut(**vars(t)) for t in service.TASK_TYPES]


@router.get("/completions")
def list_completions(db: DbDep, on: date | None = None) -> list[DayCompletionOut]:
    """Everything checked off on a day (default today), oldest first."""
    rows = db.conn.execute(queries["list_completions_on"], {"day": on or today_for(db)})
    return [DayCompletionOut.model_validate(r) for r in rows.fetchall()]


@router.get("")
def list_tasks(db: DbDep, on: date | None = None) -> list[TaskOut]:
    """Active tasks with their progress on a day (default today), soonest due first.

    To-dos finished before that day are left out; one finished that day stays (done).
    """
    day = on or today_for(db)
    rows = db.conn.execute(queries["list_tasks"], {"day": day}).fetchall()
    return [TaskOut.model_validate(service.progress(r, day)) for r in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_task(body: TaskCreate, db: DbDep) -> TaskOut:
    today = today_for(db)
    defaults = {"daily_checklist": {"daily_target": 1}, "nondaily_maintenance": {"next_due": today}}
    for key, value in defaults.get(body.task_type, {}).items():
        if getattr(body, key) is None:
            setattr(body, key, value)
    fields = _fields(body.task_type, body)
    row = db.conn.execute(
        queries["insert_task"], {"user_id": db.user_id, "task_type": body.task_type, **fields}
    ).fetchone()
    if row is None:
        raise RuntimeError("INSERT ... RETURNING returned no row")
    return _task(db, row["id"], today)


@router.get("/{task_id}")
def get_task(task_id: UUID, db: DbDep, on: date | None = None) -> TaskDetail:
    day = on or today_for(db)
    task = _task(db, task_id, day)
    rows = db.conn.execute(
        queries["list_task_completions"], {"task_id": task_id, "limit": 30}
    ).fetchall()
    return TaskDetail(**task.model_dump(), recent_completions=[CompletionOut(**r) for r in rows])


@router.put("/{task_id}")
def update_task(task_id: UUID, body: TaskUpdate, db: DbDep) -> TaskOut:
    today = today_for(db)
    current = _task(db, task_id, today)
    fields = _fields(current.task_type, body)
    db.conn.execute(queries["update_task"], {"task_id": task_id, **fields})
    return _task(db, task_id, today)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: UUID, db: DbDep) -> None:
    """Its check-offs stay in history."""
    if db.conn.execute(queries["delete_task"], {"task_id": task_id}).fetchone() is None:
        raise not_found("task")


def _locked(db: Db, task_id: UUID):
    task = db.conn.execute(queries["lock_task"], {"task_id": task_id}).fetchone()
    if task is None:
        raise not_found("task")
    return task


@router.post("/{task_id}/complete")
def complete_task(task_id: UUID, db: DbDep, body: CheckIn | None = None) -> TaskOut:
    """Checks a task off once.

    Daily: adds one to the day's count (it may go past the target). Maintenance: next
    due becomes the day plus its interval. To-do: done (409 if it already is). Keep in
    mind: not checkable (422).
    """
    today = today_for(db)
    day = (body.on if body else None) or today
    if day > today:
        raise invalid("can't check a task off in the future")
    task = _locked(db, task_id)
    task_type = task["task_type"]
    if task_type == "keep_in_mind":
        raise invalid("keep-in-mind tasks aren't checked off")
    if task_type == "adhoc_to_do":
        latest = db.conn.execute(
            queries["latest_completion"], {"task_id": task_id, "day": None}
        ).fetchone()
        if latest is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "this to-do is already done")

    completion = {"task_id": task_id, "completed_on": day, "due_on": task["next_due"]}
    db.conn.execute(queries["insert_completion"], {"user_id": db.user_id, **completion})
    if task_type == "nondaily_maintenance":
        next_due = service.add_interval(day, task["repeat_every"], task["repeat_unit"])
        db.conn.execute(queries["set_next_due"], {"task_id": task_id, "next_due": next_due})
    return _task(db, task_id, day)


@router.post("/{task_id}/undo")
def undo_completion(task_id: UUID, db: DbDep, body: CheckIn | None = None) -> TaskOut:
    """Takes back the latest check-off. Daily: the latest on the day (default today).
    Maintenance: next due goes back to what it was. To-do: open again."""
    day = (body.on if body else None) or today_for(db)
    task = _locked(db, task_id)
    only_day = day if task["task_type"] == "daily_checklist" else None
    latest = db.conn.execute(
        queries["latest_completion"], {"task_id": task_id, "day": only_day}
    ).fetchone()
    if latest is None:
        raise not_found("check-off to undo")
    db.conn.execute(queries["delete_completion"], {"completion_id": latest["id"]})
    if task["task_type"] == "nondaily_maintenance" and latest["due_on"] is not None:
        db.conn.execute(queries["set_next_due"], {"task_id": task_id, "next_due": latest["due_on"]})
    return _task(db, task_id, day)
