from datetime import date
from decimal import Decimal
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

Kind = Literal["expense", "income"]
PeriodType = Literal["week", "month", "year"]
Frequency = Literal["weekly", "monthly", "quarterly", "yearly"]
TransactionStatus = Literal["pending", "confirmed"]
Money = Annotated[Decimal, Field(max_digits=12, decimal_places=2)]
Name = Annotated[str, Field(min_length=1, max_length=100)]
LongText = Annotated[str, Field(max_length=1000)]


# --- Categories ------------------------------------------------------------------


class CategoryOut(BaseModel):
    id: UUID
    kind: Kind
    name: str
    description: str | None
    color: str | None
    icon: str | None
    sort_order: int
    is_default: bool


class CategoryCreate(BaseModel):
    kind: Kind
    name: Name
    description: Annotated[str, Field(max_length=300)] | None = None


class CategoryUpdate(BaseModel):
    """All editable fields, sent in full."""

    name: Name
    description: Annotated[str, Field(max_length=300)] | None = None


class CategoryOrder(BaseModel):
    kind: Kind
    ids: list[UUID] = Field(description="Category ids of this kind, in the desired order.")


# --- Budgets -----------------------------------------------------------------------


class BudgetOut(BaseModel):
    id: UUID
    name: str
    period_type: PeriodType
    period_start: date
    period_end: date
    notes: str | None


class BudgetCreate(BaseModel):
    period_type: PeriodType
    period_date: date = Field(
        description="Any date inside the period; the API snaps it to the period's start."
    )
    name: Name | None = Field(default=None, description="Defaults to e.g. 'October 2026'.")
    copy_from_budget_id: UUID | None = Field(
        default=None,
        description=(
            "Start from this budget's items (same period type); transactions aren't copied."
        ),
    )


class BudgetUpdate(BaseModel):
    name: Name
    notes: str | None = None


class BudgetItemOut(BaseModel):
    id: UUID
    kind: Kind
    name: str
    category_id: UUID | None
    category_name: str | None
    planned_amount: Money
    actual_amount: Money = Field(
        description="Net of confirmed allocated transactions: same kind adds, opposite subtracts."
    )
    pending_amount: Money = Field(description="The same, for transactions awaiting approval.")
    is_checklist_item: bool
    checklist_day: int | None
    checklist_done: bool
    sort_order: int


class KindTotals(BaseModel):
    planned: Money
    actual: Money


class BudgetDetail(BudgetOut):
    items: list[BudgetItemOut]
    income: KindTotals
    expense: KindTotals


class _ItemFields(BaseModel):
    name: Name
    category_id: UUID | None = None
    planned_amount: Money = Field(ge=0)
    is_checklist_item: bool = False
    checklist_day: int | None = Field(default=None, ge=1, le=28)

    @model_validator(mode="after")
    def _checklist_day_iff_checklist_item(self) -> Self:
        if self.is_checklist_item != (self.checklist_day is not None):
            raise ValueError("checklist items need a checklist_day (1-28), and only they do")
        return self


class BudgetItemCreate(_ItemFields):
    kind: Kind


class BudgetItemUpdate(_ItemFields):
    """All editable fields, sent in full. An item's kind can't change."""


class ItemOrder(BaseModel):
    ids: list[UUID] = Field(description="This budget's item ids, in the desired order.")


# --- Transactions --------------------------------------------------------------------


class AllocationIn(BaseModel):
    budget_item_id: UUID
    amount: Money = Field(gt=0)


def _one_allocation_per_item(value: list[AllocationIn]) -> list[AllocationIn]:
    ids = [a.budget_item_id for a in value]
    if len(ids) != len(set(ids)):
        raise ValueError("each budget item may appear only once")
    return value


class TransactionCreate(BaseModel):
    kind: Kind
    amount: Money = Field(gt=0)
    occurred_on: date
    payee: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    notes: LongText | None = None
    satisfies_checklist: bool = Field(
        default=False, description="Ticks off the checklist item(s) it's allocated to."
    )
    allocations: list[AllocationIn] = Field(
        default_factory=list,
        description="Budget items this counts toward. May be empty (shows as unassigned).",
    )

    _check_allocations = field_validator("allocations")(_one_allocation_per_item)


class AllocationsReplace(BaseModel):
    allocations: list[AllocationIn]

    _check_allocations = field_validator("allocations")(_one_allocation_per_item)


class ApproveIn(BaseModel):
    amount: Money | None = Field(
        default=None, gt=0, description="Corrected amount, if it differs from the rule's."
    )


class TransactionOut(BaseModel):
    id: UUID
    kind: Kind
    amount: Money
    occurred_on: date
    payee: str | None
    description: str | None
    notes: str | None
    status: TransactionStatus
    satisfies_checklist: bool
    recurring_transaction_id: UUID | None


class InboxTransactionOut(TransactionOut):
    recurring_name: str | None


class Inbox(BaseModel):
    pending: list[InboxTransactionOut] = Field(description="Awaiting approval.")
    unassigned: list[InboxTransactionOut] = Field(description="Not counted in any budget.")


class BudgetTransactionOut(TransactionOut):
    """A transaction as it appears in one budget: the part allocated to one item."""

    budget_item_id: UUID
    budget_item_name: str
    allocated_amount: Money


# --- Recurring transactions --------------------------------------------------------------


class RecurringIn(BaseModel):
    kind: Kind
    name: Name = Field(description="The budget item it counts toward (matched by name).")
    category_id: UUID | None = None
    amount: Money = Field(gt=0)
    payee: str | None = Field(default=None, max_length=200)
    notes: LongText | None = None
    frequency: Frequency
    day_of_week: int | None = Field(default=None, ge=1, le=7, description="Weekly: 1=Mon..7=Sun")
    day_of_month: int | None = Field(default=None, ge=1, le=28, description="Monthly")
    starts_on: date = Field(
        description="First occurrence for quarterly/yearly (they repeat from it); "
        "the earliest date for weekly/monthly."
    )
    ends_on: date | None = None
    auto_apply: bool = Field(
        default=False, description="Count it in every budget whose period includes the date."
    )
    requires_approval: bool = False
    satisfies_checklist: bool = False
    paused: bool = False

    @model_validator(mode="after")
    def _schedule_fields_match_frequency(self) -> Self:
        if (self.frequency == "weekly") != (self.day_of_week is not None):
            raise ValueError("weekly rules need day_of_week, and only they do")
        if (self.frequency == "monthly") != (self.day_of_month is not None):
            raise ValueError("monthly rules need day_of_month, and only they do")
        if self.frequency == "quarterly" and self.starts_on.day > 28:
            raise ValueError("quarterly rules must start on day 1-28 of a month")
        if self.ends_on is not None and self.ends_on < self.starts_on:
            raise ValueError("ends_on can't be before starts_on")
        return self


class RecurringOut(RecurringIn):
    id: UUID
    category_name: str | None
    next_occurrence: date | None


# --- Checklist ---------------------------------------------------------------------------


class ChecklistItemOut(BaseModel):
    budget_id: UUID
    budget_name: str
    item_id: UUID
    item_name: str
    kind: Kind
    checklist_day: int
    planned_amount: Money
    due_on: date
    done_on: date | None
