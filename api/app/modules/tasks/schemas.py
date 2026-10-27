from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field

TaskType = Literal["daily_checklist", "nondaily_maintenance", "adhoc_to_do", "keep_in_mind"]
RepeatUnit = Literal["day", "week", "month", "quarter", "year"]
DueStatus = Literal["overdue", "due_today", "upcoming"]
Name = Annotated[str, Field(min_length=1, max_length=200)]


class TypeOut(BaseModel):
    key: TaskType
    name: str
    summary: str
    how_it_works: str
    examples: list[str]


class _TaskFields(BaseModel):
    """Fields a type doesn't use are ignored (stored as null)."""

    name: Name
    description: Annotated[str, Field(max_length=1000)] | None = None
    repeat_every: int | None = Field(
        default=None, ge=1, le=1000, description="Maintenance: how many repeat_units apart."
    )
    repeat_unit: RepeatUnit | None = Field(default=None, description="Maintenance.")
    next_due: date | None = Field(
        default=None,
        description="Maintenance: next due date (defaults to today on create). "
        "To-do: optional due date.",
    )
    daily_target: int | None = Field(
        default=None, ge=1, le=100, description="Daily checklist: check-offs per day (default 1)."
    )


class TaskCreate(_TaskFields):
    task_type: TaskType


class TaskUpdate(_TaskFields):
    """All editable fields, sent in full. A task's type can't change."""


class TaskOut(BaseModel):
    id: UUID
    task_type: TaskType
    name: str
    description: str | None
    repeat_every: int | None
    repeat_unit: RepeatUnit | None
    next_due: date | None
    daily_target: int | None
    done_on_day: int = Field(description="Check-offs on the day asked about (default today).")
    last_done_on: date | None
    done: bool = Field(
        description="Daily: the day's target is reached. To-do: checked off. "
        "Maintenance: done on the day asked about. Keep in mind: always false."
    )
    due_status: DueStatus | None = Field(description="Against next_due; null without one.")
    days_until_due: int | None = Field(description="Negative when overdue.")


class CompletionOut(BaseModel):
    id: UUID
    completed_on: date
    due_on: date | None = Field(description="When it was due at the time, if it had a due date.")
    created_at: datetime


class TaskDetail(TaskOut):
    recent_completions: list[CompletionOut] = Field(description="Newest first, up to 30.")


class DayCompletionOut(CompletionOut):
    task_id: UUID
    task_name: str
    task_type: TaskType


class CheckIn(BaseModel):
    on: date | None = Field(
        default=None, description="The day it was done (default today); not in the future."
    )
