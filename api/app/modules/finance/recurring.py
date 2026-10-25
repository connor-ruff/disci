"""Recurring transactions: when rules occur, and turning occurrences into transactions.

Used by the API (right after a rule is saved) and by the hourly job (app/jobs/recurring.py),
always for one user at a time under row-level security.
"""

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from psycopg import Connection

from app.modules.finance.sql import queries


@dataclass(frozen=True)
class Schedule:
    frequency: str  # weekly | monthly | quarterly | yearly
    day_of_week: int | None  # weekly, ISO 1=Mon..7=Sun
    day_of_month: int | None  # monthly, 1-28
    starts_on: date  # quarterly/yearly repeat from this date
    ends_on: date | None

    @classmethod
    def of(cls, row: Any) -> "Schedule":
        return cls(
            frequency=row["frequency"],
            day_of_week=row["day_of_week"],
            day_of_month=row["day_of_month"],
            starts_on=row["starts_on"],
            ends_on=row["ends_on"],
        )


def occurrences(schedule: Schedule, start: date, end: date) -> list[date]:
    """Dates the schedule occurs on within [start, end] (inclusive), never before its
    starts_on or after its ends_on."""
    lo = max(start, schedule.starts_on)
    hi = min(end, schedule.ends_on) if schedule.ends_on else end
    if lo > hi:
        return []

    if schedule.frequency == "weekly":
        assert schedule.day_of_week is not None  # noqa: S101 - guaranteed by the DB/schema
        first = lo + timedelta(days=(schedule.day_of_week - lo.isoweekday()) % 7)
        return (
            [first + timedelta(weeks=n) for n in range((hi - first).days // 7 + 1)]
            if first <= hi
            else []
        )

    if schedule.frequency == "monthly":
        assert schedule.day_of_month is not None  # noqa: S101
        candidates = (
            date(y, m, schedule.day_of_month)
            for y, m in _months(lo.year, lo.month, hi.year, hi.month)
        )
        return [d for d in candidates if lo <= d <= hi]

    step = 3 if schedule.frequency == "quarterly" else 12
    dates, n = [], 0
    while (d := _add_months(schedule.starts_on, step * n)) <= hi:
        if d >= lo:
            dates.append(d)
        n += 1
    return dates


def next_occurrence(schedule: Schedule, today: date) -> date | None:
    """The first occurrence on or after today (or the start date, if that's later)."""
    start = max(today, schedule.starts_on)
    found = occurrences(schedule, start, start + timedelta(days=400))
    return found[0] if found else None


def generate_for_user(
    conn: Connection[dict[str, Any]], user_id: UUID, timezone: str, today: date
) -> int:
    """Creates any due occurrences (up to and including today) as transactions.

    Idempotent: each rule/date pair is created at most once, ever. Returns how many were
    created. Must run with app.user_id set to `user_id`.
    """
    created = 0
    for rule in conn.execute(queries["list_active_recurring"], {"timezone": timezone}).fetchall():
        schedule = Schedule.of(rule)
        # Never backfill dates from before the rule existed.
        for day in occurrences(schedule, rule["created_on"], today):
            row = conn.execute(
                queries["insert_generated_transaction"],
                {
                    "user_id": user_id,
                    "kind": rule["kind"],
                    "amount": rule["amount"],
                    "scheduled_on": day,
                    "payee": rule["payee"],
                    "notes": rule["notes"],
                    "status": "pending" if rule["requires_approval"] else "confirmed",
                    "recurring_id": rule["id"],
                    "satisfies_checklist": rule["satisfies_checklist"],
                },
            ).fetchone()
            if row is None:
                continue  # already generated (or rejected/deleted) earlier
            created += 1
            if rule["auto_apply"]:
                _apply_to_budgets(conn, user_id, row["id"], rule, schedule, day)
    return created


def _apply_to_budgets(
    conn: Connection[dict[str, Any]],
    user_id: UUID,
    transaction_id: UUID,
    rule: Any,
    schedule: Schedule,
    day: date,
) -> None:
    """Counts the transaction toward the rule's item in every budget covering `day`,
    creating the item (planned for all of the rule's occurrences in that budget) if the
    budget doesn't have one with that name yet."""
    for budget in conn.execute(queries["list_budgets_covering"], {"day": day}).fetchall():
        item = conn.execute(
            queries["find_item_by_name"],
            {"budget_id": budget["id"], "kind": rule["kind"], "name": rule["name"]},
        ).fetchone()
        if item is None:
            count = len(occurrences(schedule, budget["period_start"], budget["period_end"]))
            item = conn.execute(
                queries["insert_budget_item"],
                {
                    "user_id": user_id,
                    "budget_id": budget["id"],
                    "kind": rule["kind"],
                    "name": rule["name"],
                    "category_id": rule["category_id"],
                    "planned_amount": rule["amount"] * Decimal(max(count, 1)),
                    "is_checklist_item": False,
                    "checklist_day": None,
                },
            ).fetchone()
        conn.execute(
            queries["insert_allocation"],
            {
                "user_id": user_id,
                "transaction_id": transaction_id,
                "budget_item_id": item["id"],  # type: ignore[index]
                "amount": rule["amount"],
            },
        )


def _months(y1: int, m1: int, y2: int, m2: int):
    y, m = y1, m1
    while (y, m) <= (y2, m2):
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def _add_months(d: date, months: int) -> date:
    """Same day-of-month `months` later, clamped to the month's end (Feb 29 → Feb 28)."""
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))
