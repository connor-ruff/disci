"""Recurring transactions: when rules occur, and turning occurrences into transactions.

Used by the API (right after a rule is saved) and by the hourly job (app/jobs/recurring.py),
always for one user at a time under row-level security.
"""

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
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
    """Creates any due occurrences (up to and including today) as transactions, and the
    Inbox entries that go with them.

    Idempotent: each rule/date pair is created at most once, ever. Returns how many were
    created. Must run with app.user_id set to `user_id`.
    """
    created = 0
    for rule in conn.execute(queries["list_active_recurring"], {"timezone": timezone}).fetchall():
        # Never backfill dates from before the rule existed.
        for day in occurrences(Schedule.of(rule), rule["created_on"], today):
            budgets = conn.execute(queries["list_budgets_covering"], {"day": day}).fetchall()
            # Applied automatically only when asked to and there's somewhere to apply it;
            # otherwise it waits in the Inbox, pending, for the user to place.
            applying = rule["auto_apply"] and bool(budgets)
            row = conn.execute(
                queries["insert_generated_transaction"],
                {
                    "user_id": user_id,
                    "kind": rule["kind"],
                    "amount": rule["amount"],
                    "scheduled_on": day,
                    "payee": rule["payee"],
                    "notes": rule["notes"],
                    "status": "confirmed" if applying else "pending",
                    "recurring_id": rule["id"],
                },
            ).fetchone()
            if row is None:
                continue  # already generated (or rejected/deleted) earlier
            created += 1
            if applying:
                _apply_to_budgets(conn, user_id, row["id"], rule, budgets)
            else:
                _inbox(conn, user_id, row["id"], "place")
    return created


def _apply_to_budgets(
    conn: Connection[dict[str, Any]],
    user_id: UUID,
    transaction_id: UUID,
    rule: Any,
    budgets: list[Any],
) -> None:
    """Counts the transaction toward the rule's item in each budget that has it (same
    name and category), noting it in the Inbox ledger. A budget without one gets a
    "pick an item" Inbox entry instead; items are never created here."""
    for budget in budgets:
        item = conn.execute(
            queries["find_rule_item"],
            {
                "budget_id": budget["id"],
                "kind": rule["kind"],
                "name": rule["item_name"],
                "category_id": rule["category_id"],
            },
        ).fetchone()
        if item is None:
            _inbox(conn, user_id, transaction_id, "pick_item", budget["id"])
            continue
        conn.execute(
            queries["insert_allocation"],
            {
                "user_id": user_id,
                "transaction_id": transaction_id,
                "budget_item_id": item["id"],
                "amount": rule["amount"],
            },
        )
        _inbox(conn, user_id, transaction_id, "applied", budget["id"], item["id"])


def _inbox(
    conn: Connection[dict[str, Any]],
    user_id: UUID,
    transaction_id: UUID,
    kind: str,
    budget_id: UUID | None = None,
    budget_item_id: UUID | None = None,
) -> None:
    conn.execute(
        queries["insert_inbox_entry"],
        {
            "user_id": user_id,
            "transaction_id": transaction_id,
            "kind": kind,
            "budget_id": budget_id,
            "budget_item_id": budget_item_id,
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
