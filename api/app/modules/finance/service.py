"""Finance business rules that don't belong in SQL."""

import calendar
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from app.modules.finance.schemas import AllocationIn, BudgetItemOut, KindTotals, PeriodType

# Seeded when a user first enables Finance. (Also copied, frozen, into the one-time
# backfill migration 20261025153025_finance__backfill_default_categories.sql.)
DEFAULT_EXPENSE_CATEGORIES = [
    "Housing",
    "Insurance",
    "Utilities",
    "Transportation",
    "Debts",
    "Savings",
    "Food",
    "Personal",
    "Health",
]


def period_bounds(period_type: PeriodType, day: date, week_starts_on: int) -> tuple[date, date]:
    """The period of `period_type` containing `day`, as inclusive (start, end).

    `week_starts_on` uses ISO numbering (1 = Monday ... 7 = Sunday), per core.users.
    """
    if period_type == "month":
        last = calendar.monthrange(day.year, day.month)[1]
        return day.replace(day=1), day.replace(day=last)
    if period_type == "year":
        return date(day.year, 1, 1), date(day.year, 12, 31)
    start = day - timedelta(days=(day.isoweekday() - week_starts_on) % 7)
    return start, start + timedelta(days=6)


def default_budget_name(period_type: PeriodType, start: date) -> str:
    if period_type == "month":
        return start.strftime("%B %Y")
    if period_type == "year":
        return str(start.year)
    return f"Week of {start.strftime('%b')} {start.day}, {start.year}"


def allocation_errors(
    amount: Decimal, allocations: list[AllocationIn], item_budgets: dict[UUID, UUID]
) -> str | None:
    """Why these allocations are invalid, or None.

    `item_budgets` maps each visible budget item id to its budget id. Within one budget a
    transaction's allocations may not exceed its amount; across budgets the same dollars
    may count again (e.g. a monthly and a yearly budget).
    """
    per_budget: dict[UUID, Decimal] = defaultdict(Decimal)
    for allocation in allocations:
        budget_id = item_budgets.get(allocation.budget_item_id)
        if budget_id is None:
            return f"unknown budget item: {allocation.budget_item_id}"
        per_budget[budget_id] += allocation.amount
    if any(total > amount for total in per_budget.values()):
        return "allocations within a budget can't exceed the transaction amount"
    return None


def kind_totals(items: list[BudgetItemOut]) -> dict[str, KindTotals]:
    totals = {
        kind: KindTotals(planned=Decimal("0.00"), actual=Decimal("0.00"))
        for kind in ("income", "expense")
    }
    for item in items:
        totals[item.kind].planned += item.planned_amount
        totals[item.kind].actual += item.actual_amount
    return totals
