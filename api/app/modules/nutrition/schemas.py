from datetime import date
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field

NutrientKey = Literal[
    "calories",
    "protein_g",
    "total_fat_g",
    "saturated_fat_g",
    "trans_fat_g",
    "cholesterol_mg",
    "sodium_mg",
    "total_carbs_g",
    "fiber_g",
    "total_sugars_g",
    "added_sugars_g",
]
GoalKind = Literal["target", "limit"]
# Food values keep 6 decimal places (derived values like "per oz" are often fractional).
Amount = Annotated[Decimal, Field(ge=0, max_digits=16, decimal_places=6)]
Quantity = Annotated[Decimal, Field(gt=0, max_digits=16, decimal_places=6)]
Name = Annotated[str, Field(min_length=1, max_length=100)]


# --- Settings --------------------------------------------------------------------------


class NutrientOut(BaseModel):
    key: NutrientKey
    label: str
    unit: str


class PreferencesOut(BaseModel):
    tracked_nutrients: list[NutrientKey] = Field(description="In display order.")
    nutrients: list[NutrientOut] = Field(description="Every nutrient the app knows, in order.")


class PreferencesIn(BaseModel):
    tracked_nutrients: list[NutrientKey]


# --- Food repo ---------------------------------------------------------------------------


class _Nutrients(BaseModel):
    """Per one standard quantity (a quick add: for what was eaten). None = unknown (not 0)."""

    calories: Amount | None = None
    protein_g: Amount | None = None
    total_fat_g: Amount | None = None
    saturated_fat_g: Amount | None = None
    trans_fat_g: Amount | None = None
    cholesterol_mg: Amount | None = None
    sodium_mg: Amount | None = None
    total_carbs_g: Amount | None = None
    fiber_g: Amount | None = None
    total_sugars_g: Amount | None = None
    added_sugars_g: Amount | None = None


class FoodIn(_Nutrients):
    """All editable fields, sent in full."""

    name: Name
    description: Annotated[str, Field(max_length=500)] | None = None
    standard_quantity: Quantity
    standard_unit: Annotated[str, Field(min_length=1, max_length=30)]


class FoodOut(FoodIn):
    id: UUID
    last_logged_on: date | None = Field(description="Most recent day it was logged, if ever.")


# --- Food log ----------------------------------------------------------------------------


class LogCreate(BaseModel):
    food_item_id: UUID
    eaten_on: date
    servings: Quantity = Field(description="Multiples of the food's standard quantity.")
    notes: Annotated[str, Field(max_length=500)] | None = None


class LogUpdate(BaseModel):
    """All editable fields, sent in full. The food can't change; log a new entry instead."""

    eaten_on: date
    servings: Quantity
    notes: Annotated[str, Field(max_length=500)] | None = None


class QuickLogIn(_Nutrients):
    """A quick add: a one-off entry with its own name and nutrients, not saved to the repo.

    Nutrients are totals for what was eaten. All editable fields, sent in full.
    """

    name: Name
    eaten_on: date
    notes: Annotated[str, Field(max_length=500)] | None = None


class LogOut(BaseModel):
    id: UUID
    food_item_id: UUID | None = Field(description="None for a quick add.")
    food_name: str = Field(description="The repo food's name, or the quick add's own.")
    food_deleted: bool = Field(description="The food was removed from the repo since.")
    standard_quantity: Decimal | None = Field(description="None for a quick add.")
    standard_unit: str | None = Field(description="None for a quick add.")
    eaten_on: date
    servings: Decimal = Field(description="Always 1 for a quick add.")
    notes: str | None
    nutrients: dict[NutrientKey, Decimal | None] = Field(
        description="The food's values times servings; None where the food has no value."
    )


class NutrientTotal(BaseModel):
    nutrient: NutrientKey
    amount: Decimal | None = Field(
        description="Sum of the known values; None when no entry has a value."
    )
    missing_foods: list[str] = Field(description="Foods logged this day with no value for it.")


class DayOut(BaseModel):
    date: date
    entries: list[LogOut]
    totals: list[NutrientTotal]


class DaySummary(BaseModel):
    date: date
    entry_count: int
    totals: list[NutrientTotal]


# --- Goals ---------------------------------------------------------------------------------


class GoalIn(BaseModel):
    nutrient: NutrientKey
    kind: GoalKind = Field(description="target: reach at least; limit: stay under.")
    amount: Annotated[Decimal, Field(gt=0, max_digits=10, decimal_places=2)]


class GoalUpdate(BaseModel):
    amount: Annotated[Decimal, Field(gt=0, max_digits=10, decimal_places=2)]


class GoalOut(GoalIn):
    id: UUID
    starts_on: date
    ends_on: date | None
