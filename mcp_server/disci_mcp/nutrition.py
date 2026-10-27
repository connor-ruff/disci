"""Nutrition tools. Thin wrappers over the API's /nutrition endpoints
(docs/api/api-overview.md §7.2), shaped for an assistant: one call answers one question."""

import asyncio
from datetime import date
from decimal import Decimal
from typing import Annotated, Any, Literal

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from pydantic import BaseModel, Field

from disci_mcp import api
from disci_mcp.common import DESTRUCTIVE, READ, WRITE, each, num

NutrientKey = Literal[
    "calories", "protein_g", "total_fat_g", "saturated_fat_g", "trans_fat_g",
    "cholesterol_mg", "sodium_mg", "total_carbs_g", "fiber_g", "total_sugars_g",
    "added_sugars_g",
]  # fmt: skip
NUTRIENT_KEYS: list[str] = list(NutrientKey.__args__)  # type: ignore[attr-defined]
Value = Annotated[Decimal, Field(ge=0, max_digits=16, decimal_places=6)] | None
Servings = Annotated[Decimal, Field(gt=0, max_digits=16, decimal_places=6)]


def _food(f: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": f["id"],
        "name": f["name"],
        "description": f["description"],
        "standard_quantity": num(f["standard_quantity"]),
        "standard_unit": f["standard_unit"],
        # Per one standard quantity; missing keys are unknown, not 0.
        "nutrients": {k: num(f[k]) for k in NUTRIENT_KEYS if f[k] is not None},
        "last_logged_on": f["last_logged_on"],
    }


async def _day(day: date) -> dict[str, Any]:
    """A day's entries, and per tracked nutrient its total and the goals in effect."""
    sheet, prefs, goals = await asyncio.gather(
        api.get(f"/nutrition/days/{day.isoformat()}"),
        api.get("/nutrition/preferences"),
        api.get("/nutrition/goals", {"on": day.isoformat()}),
    )
    tracked = prefs["tracked_nutrients"]
    units = {n["key"]: n["unit"] for n in prefs["nutrients"]}
    totals = {t["nutrient"]: t for t in sheet["totals"]}
    nutrients = []
    for key in tracked:
        row: dict[str, Any] = {
            "nutrient": key,
            "unit": units[key],
            "total": num(totals[key]["amount"]),
        }
        for g in goals:
            if g["nutrient"] == key:
                row[g["kind"]] = num(g["amount"])
        if totals[key]["missing_foods"]:
            row["missing_foods"] = totals[key]["missing_foods"]
        nutrients.append(row)
    return {
        "date": sheet["date"],
        "entries": [
            {
                "id": e["id"],
                "food_id": e["food_item_id"],
                "food_name": e["food_name"],
                "servings": num(e["servings"]),
                "serving": f"{num(e['standard_quantity'])} {e['standard_unit']}",
                "notes": e["notes"],
                "nutrients": {k: num(e["nutrients"][k]) for k in tracked},
            }
            for e in sheet["entries"]
        ],
        "nutrients": nutrients,
    }


class FoodEntry(BaseModel):
    food_id: str
    servings: Servings = Field(
        description="Multiples of the food's standard quantity, e.g. 6 oz of a 170 g food "
        "is 170.1/170 = 1.0006; 2 of a '1 medium' apple is 2."
    )
    notes: str | None = None


def register(mcp: FastMCP) -> None:
    @mcp.tool(annotations=READ)
    async def get_nutrition_settings() -> dict[str, Any]:
        """The nutrients the user tracks (with units) and their goals in effect today.

        A `target` is an amount to reach at least; a `limit` one to stay under. Use before
        adding a food (to know which label values matter most) or changing a goal.
        """
        prefs, goals = await asyncio.gather(
            api.get("/nutrition/preferences"), api.get("/nutrition/goals")
        )
        tracked = set(prefs["tracked_nutrients"])
        return {
            "tracked_nutrients": [n for n in prefs["nutrients"] if n["key"] in tracked],
            "other_nutrients": [n["key"] for n in prefs["nutrients"] if n["key"] not in tracked],
            "goals": [
                {
                    k: num(g[k]) if k == "amount" else g[k]
                    for k in ("id", "nutrient", "kind", "amount", "starts_on")
                }
                for g in goals
            ],
        }

    @mcp.tool(annotations=READ)
    async def search_foods(query: str | None = None, limit: int = 25) -> dict[str, Any]:
        """Search the user's food repo by name and description (any word may match; best
        matches first). Leave query empty to list the repo by name.

        Use before logging (to find each food's id and standard quantity) and before
        adding a food (to avoid duplicates). Nutrients are per one standard quantity;
        a missing nutrient is unknown, not 0.
        """
        foods = await api.get("/nutrition/foods")
        words = (query or "").lower().split()
        if words:
            scored = []
            for f in foods:
                text = f"{f['name']} {f['description'] or ''}".lower()
                score = sum(w in text for w in words)
                if score:
                    scored.append((-score, f))
            scored.sort(key=lambda s: s[0])  # stable: ties stay in name order
            foods = [f for _, f in scored]
        return {"total_matches": len(foods), "foods": [_food(f) for f in foods[:limit]]}

    @mcp.tool(annotations=WRITE)
    async def add_food(
        name: str,
        standard_quantity: Servings,
        standard_unit: str,
        description: str | None = None,
        calories: Value = None,
        protein_g: Value = None,
        total_fat_g: Value = None,
        saturated_fat_g: Value = None,
        trans_fat_g: Value = None,
        cholesterol_mg: Value = None,
        sodium_mg: Value = None,
        total_carbs_g: Value = None,
        fiber_g: Value = None,
        total_sugars_g: Value = None,
        added_sugars_g: Value = None,
    ) -> dict[str, Any]:
        """Add a food to the user's food repo, e.g. from a nutrition label.

        Check search_foods for an existing match first. Names must be unique.

        Args:
            name: e.g. "TJ's Greek Yogurt, plain nonfat".
            standard_quantity, standard_unit: The serving the values are for, e.g. 170 and
                "g", or 1 and "medium apple". Prefer the label's metric serving.
            description: Brand, flavor, or anything that tells similar foods apart.
            calories ... added_sugars_g: Per standard quantity. Leave out what the label
                doesn't give (unknown is not 0).
        """
        values = locals()
        body = {
            "name": name,
            "description": description,
            "standard_quantity": str(standard_quantity),
            "standard_unit": standard_unit,
            **{k: None if values[k] is None else str(values[k]) for k in NUTRIENT_KEYS},
        }
        return _food(await api.post("/nutrition/foods", body))

    @mcp.tool(annotations=WRITE)
    async def log_foods(entries: list[FoodEntry], eaten_on: date | None = None) -> dict[str, Any]:
        """Log foods the user ate, one entry per food, then report the day.

        Find each food with search_foods first; offer to add_food any that's missing.

        Args:
            entries: Foods and servings (multiples of each food's standard quantity).
            eaten_on: YYYY-MM-DD. Defaults to today in the user's timezone.

        Returns each entry's outcome, then the day: every entry, and per tracked nutrient
        the day's total next to its target/limit.
        """
        day = eaten_on or await api.today()
        logged = await each(
            [e.food_id for e in entries],
            [
                api.post(
                    "/nutrition/logs",
                    {
                        "food_item_id": e.food_id,
                        "eaten_on": day.isoformat(),
                        "servings": str(e.servings),
                        "notes": e.notes,
                    },
                )
                for e in entries
            ],
        )
        results = []
        for r in logged:
            if r["ok"]:
                log = r["result"]
                results.append({"food_id": r["id"], "ok": True, "log_id": log["id"],
                                "food_name": log["food_name"]})  # fmt: skip
            else:
                results.append({"food_id": r["id"], "ok": False, "error": r["error"]})
        return {"results": results, "day": await _day(day)}

    @mcp.tool(annotations=READ)
    async def get_food_day(day: date | None = None) -> dict[str, Any]:
        """One day's food log: every entry (with its log id), and per tracked nutrient the
        total next to its target/limit. Defaults to today in the user's timezone.

        `missing_foods` lists foods with no value for that nutrient (the total skips them).
        """
        return await _day(day or await api.today())

    @mcp.tool(annotations=WRITE)
    async def update_food_log(
        log_id: str,
        eaten_on: date,
        servings: Servings | None = None,
        move_to: date | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        """Fix a food log entry: change its servings, move it to another day, or set notes.
        To change the food itself, delete the entry and log the right food.

        Args:
            log_id: From get_food_day or log_foods.
            eaten_on: The day the entry is on now.
            servings: New servings, if changing.
            move_to: The day it should be on instead, if changing.
            notes: New notes, if changing.
        """
        sheet = await api.get(f"/nutrition/days/{eaten_on.isoformat()}")
        entry = next((e for e in sheet["entries"] if e["id"] == log_id), None)
        if entry is None:
            raise ToolError(f"No log entry {log_id} on {eaten_on}. Check get_food_day.")
        body = {
            "eaten_on": (move_to or eaten_on).isoformat(),
            "servings": str(servings) if servings is not None else entry["servings"],
            "notes": entry["notes"] if notes is None else notes,
        }
        await api.put(f"/nutrition/logs/{log_id}", body)
        return await _day(move_to or eaten_on)

    @mcp.tool(annotations=DESTRUCTIVE)
    async def delete_food_log(log_id: str) -> dict[str, Any]:
        """Delete a food log entry (e.g. logged by mistake). Log ids come from
        get_food_day or log_foods. Confirm with the user first."""
        await api.delete(f"/nutrition/logs/{log_id}")
        return {"deleted": log_id}

    @mcp.tool(annotations=WRITE)
    async def set_nutrition_goal(
        nutrient: NutrientKey,
        kind: Literal["target", "limit"],
        amount: Annotated[Decimal, Field(gt=0, max_digits=10, decimal_places=2)],
    ) -> dict[str, Any]:
        """Set a daily goal, e.g. limit calories to 1800 or a protein target of 120 g.

        Replaces the current goal of the same nutrient and kind, if any. It applies from
        today; earlier days keep the goal they had. Check get_nutrition_settings first
        and tell the user the current value.

        Args:
            nutrient: e.g. "calories", "protein_g", "sodium_mg".
            kind: "target" (reach at least) or "limit" (stay under).
            amount: In the nutrient's unit (kcal, g or mg).
        """
        goals = await api.get("/nutrition/goals")
        current = next((g for g in goals if g["nutrient"] == nutrient and g["kind"] == kind), None)
        if current is None:
            goal = await api.post(
                "/nutrition/goals", {"nutrient": nutrient, "kind": kind, "amount": str(amount)}
            )
        else:
            goal = await api.put(f"/nutrition/goals/{current['id']}", {"amount": str(amount)})
        return {
            "nutrient": goal["nutrient"],
            "kind": goal["kind"],
            "amount": num(goal["amount"]),
            "previous_amount": None if current is None else num(current["amount"]),
            "starts_on": goal["starts_on"],
        }
