"""Nutrition business rules that don't belong in SQL."""

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from app.modules.nutrition.schemas import NutrientKey, NutrientTotal


@dataclass(frozen=True)
class Nutrient:
    key: NutrientKey
    label: str
    unit: str


# Every nutrient the app knows, in display order (a US nutrition label's order, with
# calories and protein first). Keys are also the food_items column names.
NUTRIENTS: list[Nutrient] = [
    Nutrient("calories", "Calories", "kcal"),
    Nutrient("protein_g", "Protein", "g"),
    Nutrient("total_fat_g", "Total fat", "g"),
    Nutrient("saturated_fat_g", "Saturated fat", "g"),
    Nutrient("trans_fat_g", "Trans fat", "g"),
    Nutrient("cholesterol_mg", "Cholesterol", "mg"),
    Nutrient("sodium_mg", "Sodium", "mg"),
    Nutrient("total_carbs_g", "Total carbs", "g"),
    Nutrient("fiber_g", "Fiber", "g"),
    Nutrient("total_sugars_g", "Total sugars", "g"),
    Nutrient("added_sugars_g", "Added sugars", "g"),
]
NUTRIENT_KEYS: list[NutrientKey] = [n.key for n in NUTRIENTS]

# Tracked until the user changes it in Settings.
DEFAULT_TRACKED: list[NutrientKey] = [
    "calories",
    "protein_g",
    "saturated_fat_g",
    "sodium_mg",
    "added_sugars_g",
]

CENT = Decimal("0.01")


def in_display_order(keys: list[str]) -> list[NutrientKey]:
    return [k for k in NUTRIENT_KEYS if k in keys]


def entry_nutrients(row: dict[str, Any]) -> dict[NutrientKey, Decimal | None]:
    """A log row's nutrients: the food's per-standard values times servings (None stays None)."""
    servings = row["servings"]
    return {
        key: None if row[key] is None else (row[key] * servings).quantize(CENT)
        for key in NUTRIENT_KEYS
    }


def day_totals(entries: list[tuple[str, dict[NutrientKey, Decimal | None]]]) -> list[NutrientTotal]:
    """Totals per nutrient over (food name, nutrients) entries.

    Unknown values aren't counted as 0: the total covers the known ones, and
    `missing_foods` names the foods without a value. With nothing known, it's None.
    """
    totals = []
    for key in NUTRIENT_KEYS:
        known = [n[key] for _, n in entries if n[key] is not None]
        missing = sorted({name for name, n in entries if n[key] is None}, key=str.lower)
        amount = sum(known, Decimal("0.00")) if known or not entries else None
        totals.append(NutrientTotal(nutrient=key, amount=amount, missing_foods=missing))
    return totals
