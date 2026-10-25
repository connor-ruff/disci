from datetime import date
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

Kind = Literal["expense", "income"]
PeriodType = Literal["week", "month", "year"]
Money = Annotated[Decimal, Field(max_digits=12, decimal_places=2)]
Name = Annotated[str, Field(min_length=1, max_length=100)]


# --- Categories ------------------------------------------------------------------


class CategoryOut(BaseModel):
    id: UUID
    kind: Kind
    name: str
    color: str | None
    icon: str | None
    sort_order: int
    is_default: bool


class CategoryCreate(BaseModel):
    kind: Kind
    name: Name


class CategoryUpdate(BaseModel):
    name: Name


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
        description="Net of allocated transactions: same kind adds, opposite kind subtracts."
    )
    sort_order: int


class KindTotals(BaseModel):
    planned: Money
    actual: Money


class BudgetDetail(BudgetOut):
    items: list[BudgetItemOut]
    income: KindTotals
    expense: KindTotals


class BudgetItemCreate(BaseModel):
    kind: Kind
    name: Name
    category_id: UUID | None = None
    planned_amount: Money = Field(ge=0)


class BudgetItemUpdate(BaseModel):
    """All editable fields, sent in full. An item's kind can't change."""

    name: Name
    category_id: UUID | None = None
    planned_amount: Money = Field(ge=0)


# --- Transactions --------------------------------------------------------------------


class AllocationIn(BaseModel):
    budget_item_id: UUID
    amount: Money = Field(gt=0)


class TransactionCreate(BaseModel):
    kind: Kind
    amount: Money = Field(gt=0)
    occurred_on: date
    payee: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    allocations: list[AllocationIn] = Field(
        default_factory=list,
        description="Budget items this counts toward. May be empty (shows as unassigned).",
    )

    @field_validator("allocations")
    @classmethod
    def _one_allocation_per_item(cls, value: list[AllocationIn]) -> list[AllocationIn]:
        ids = [a.budget_item_id for a in value]
        if len(ids) != len(set(ids)):
            raise ValueError("each budget item may appear only once")
        return value


class TransactionOut(BaseModel):
    id: UUID
    kind: Kind
    amount: Money
    occurred_on: date
    payee: str | None
    description: str | None


class BudgetTransactionOut(TransactionOut):
    """A transaction as it appears in one budget: the part allocated to one item."""

    budget_item_id: UUID
    budget_item_name: str
    allocated_amount: Money
