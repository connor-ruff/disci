"""Tasks business rules that don't belong in SQL."""

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from app.modules.tasks.schemas import DueStatus, RepeatUnit, TaskType


@dataclass(frozen=True)
class TypeInfo:
    key: TaskType
    name: str
    summary: str
    how_it_works: str
    examples: list[str]


# The four task types, fixed (each has its own behavior in code), in display order.
TASK_TYPES: list[TypeInfo] = [
    TypeInfo(
        "daily_checklist",
        "Daily checklist",
        "Habits to do every day, once or several times.",
        'Set how many times a day counts as done (1 for "take my pill", 5 for "5 sets of '
        'jaw exercises") and check it off each time. Every day starts fresh at zero: '
        "yesterday's count has no bearing on today.",
        ["Take cholesterol pill", "Fill the Brita before bed", "5 sets of jaw exercises"],
    ),
    TypeInfo(
        "nondaily_maintenance",
        "Maintenance",
        "Upkeep that comes back roughly every few days, weeks or months.",
        "Choose how often (every 2 weeks, every 3 months...). When you check it off, it's "
        "next due that long after the day you did it, so doing it late pushes the next "
        "one out. Change the next due date any time to snooze it.",
        ["Wash the bedsheets every 2 weeks", "Replace the HVAC filter every quarter"],
    ),
    TypeInfo(
        "adhoc_to_do",
        "To-do",
        "One-time tasks, with or without a due date.",
        "Check it off once and it's done. It stays on today's list, crossed off, until the "
        "day ends, and is kept in your history.",
        ["Book flights for Christmas", 'Return "Black Wave" to the library by Nov 1'],
    ),
    TypeInfo(
        "keep_in_mind",
        "Keep in mind",
        "Evergreen reminders with no due date and nothing to check off.",
        "They're simply shown, so they stay front of mind as you go about your day.",
        ["Remember to say please", "Read more"],
    ),
]

# The columns each type uses (beyond name and description); the others must be null.
USES: dict[TaskType, set[str]] = {
    "daily_checklist": {"daily_target"},
    "nondaily_maintenance": {"repeat_every", "repeat_unit", "next_due"},
    "adhoc_to_do": {"next_due"},
    "keep_in_mind": set(),
}
OPTIONAL = {"repeat_every", "repeat_unit", "next_due", "daily_target"}
REQUIRED: dict[TaskType, set[str]] = {
    "daily_checklist": {"daily_target"},
    "nondaily_maintenance": {"repeat_every", "repeat_unit", "next_due"},
    "adhoc_to_do": set(),
    "keep_in_mind": set(),
}


def type_fields(task_type: TaskType, fields: dict[str, Any]) -> dict[str, Any]:
    """`fields` with what this type doesn't use cleared. Raises ValueError naming what a
    type requires but is missing.

    Clearing (rather than rejecting) unused fields lets a form send everything it has.
    """
    out = {k: (v if k in USES[task_type] else None) for k, v in fields.items() if k in OPTIONAL}
    out |= {k: v for k, v in fields.items() if k not in OPTIONAL}
    missing = sorted(k for k in REQUIRED[task_type] if out.get(k) is None)
    if missing:
        raise ValueError(f"{task_type} tasks need {', '.join(missing)}")
    return out


def add_interval(day: date, every: int, unit: RepeatUnit) -> date:
    """`day` plus `every` units. Months, quarters and years are calendar months; a day
    that doesn't exist in the target month clamps to its end (Jan 31 + 1 month = Feb 28)."""
    if unit == "day":
        return day + timedelta(days=every)
    if unit == "week":
        return day + timedelta(weeks=every)
    months = every * {"month": 1, "quarter": 3, "year": 12}[unit]
    year, month = divmod(day.year * 12 + day.month - 1 + months, 12)
    last = calendar.monthrange(year, month + 1)[1]
    return date(year, month + 1, min(day.day, last))


def due_status(due: date | None, day: date) -> tuple[DueStatus | None, int | None]:
    """How `due` stands on `day`: (status, days until due; negative when overdue)."""
    if due is None:
        return None, None
    days = (due - day).days
    return ("overdue" if days < 0 else "due_today" if days == 0 else "upcoming"), days


def progress(row: dict[str, Any], day: date) -> dict[str, Any]:
    """A task row from list_tasks/get_task, plus whether it's done and how its due date
    stands on `day`."""
    task_type: TaskType = row["task_type"]
    last = row["last_done_on"]
    if task_type == "daily_checklist":
        done = row["done_on_day"] >= row["daily_target"]
    elif task_type == "adhoc_to_do":
        done = last is not None
    elif task_type == "nondaily_maintenance":
        done = last == day  # done today; it's already due again later
    else:
        done = False
    status, days = due_status(row["next_due"], day)
    if done and task_type == "adhoc_to_do":
        status, days = None, None  # a finished to-do isn't overdue
    return {**row, "done": done, "due_status": status, "days_until_due": days}
