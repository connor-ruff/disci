import pytest
from mcp.server.fastmcp.exceptions import ToolError

from tests.conftest import FakeApi, call_tool

NUTRIENTS = [
    {"key": "calories", "label": "Calories", "unit": "kcal"},
    {"key": "protein_g", "label": "Protein", "unit": "g"},
    {"key": "sodium_mg", "label": "Sodium", "unit": "mg"},
]
ALL_KEYS = ["calories", "protein_g", "total_fat_g", "saturated_fat_g", "trans_fat_g",
            "cholesterol_mg", "sodium_mg", "total_carbs_g", "fiber_g", "total_sugars_g",
            "added_sugars_g"]  # fmt: skip


def food(id_: str, name: str, description: str | None = None, **values: str) -> dict:
    return {
        "id": id_, "name": name, "description": description,
        "standard_quantity": "170.000000", "standard_unit": "g", "last_logged_on": None,
        **{k: values.get(k) for k in ALL_KEYS},
    }  # fmt: skip


FOODS = [
    food("f-apple", "Apple", "medium", calories="95.000000"),
    food("f-greek", "Greek yogurt", "Trader Joe's plain nonfat", calories="90.000000"),
    food("f-tj", "TJ granola", None),
]


def entry(id_: str, food_id: str, name: str, servings: str, calories: str | None) -> dict:
    nutrients = dict.fromkeys(ALL_KEYS) | {"calories": calories}
    return {
        "id": id_, "food_item_id": food_id, "food_name": name, "food_deleted": False,
        "standard_quantity": "170.000000", "standard_unit": "g", "eaten_on": "2026-10-26",
        "servings": servings, "notes": None, "nutrients": nutrients,
    }  # fmt: skip


@pytest.fixture
def nutrition(fake_api: FakeApi) -> FakeApi:
    day = {
        "date": "2026-10-26",
        "entries": [entry("l1", "f-greek", "Greek yogurt", "1.000600", "90.054000")],
        "totals": [
            {"nutrient": k, "amount": "90.054000" if k == "calories" else None,
             "missing_foods": [] if k == "calories" else ["Greek yogurt"]}
            for k in ALL_KEYS
        ],
    }  # fmt: skip
    goal = {"id": "g1", "nutrient": "calories", "kind": "limit", "amount": "2000.00",
            "starts_on": "2026-10-01", "ends_on": None}  # fmt: skip
    fake_api.routes |= {
        ("GET", "/nutrition/foods"): FOODS,
        ("GET", "/nutrition/preferences"): {
            "tracked_nutrients": ["calories", "protein_g"],
            "nutrients": NUTRIENTS,
        },
        ("GET", "/nutrition/goals"): [goal],
        ("GET", "/nutrition/days/2026-10-26"): day,
    }
    return fake_api


def test_settings_lists_tracked_nutrients_and_goals(nutrition: FakeApi) -> None:
    result = call_tool("get_nutrition_settings", {})
    assert [n["key"] for n in result["tracked_nutrients"]] == ["calories", "protein_g"]
    assert result["other_nutrients"] == ["sodium_mg"]
    assert result["goals"][0] | {"id": None} == {
        "id": None, "nutrient": "calories", "kind": "limit", "amount": "2000",
        "starts_on": "2026-10-01",
    }  # fmt: skip


def test_search_ranks_by_words_matched(nutrition: FakeApi) -> None:
    result = call_tool("search_foods", {"query": "TJ greek yogurt"})
    # Greek yogurt matches 2 words (its description says Trader Joe's, not TJ); granola 1.
    assert [f["name"] for f in result["foods"]] == ["Greek yogurt", "TJ granola"]
    greek = result["foods"][0]
    assert greek["standard_quantity"] == "170"
    assert greek["nutrients"] == {"calories": "90"}  # unknowns left out

    assert call_tool("search_foods", {})["total_matches"] == 3


def test_add_food_sends_unknowns_as_null(nutrition: FakeApi) -> None:
    created = food("f-new", "Banana", calories="105.000000")
    nutrition.routes[("POST", "/nutrition/foods")] = created

    result = call_tool(
        "add_food",
        {"name": "Banana", "standard_quantity": 118, "standard_unit": "g", "calories": 105},
    )

    [body] = nutrition.sent("POST", "/nutrition/foods")
    assert body["calories"] == "105"
    assert body["protein_g"] is None
    assert result["id"] == "f-new"


def test_log_foods_reports_each_entry_and_the_day(nutrition: FakeApi) -> None:
    def create(body: dict) -> dict:
        if body["food_item_id"] == "f-gone":
            raise ToolError("Disci API error 404: food not found")
        return entry("l2", body["food_item_id"], "Apple", body["servings"], "95")

    nutrition.routes[("POST", "/nutrition/logs")] = create

    result = call_tool(
        "log_foods",
        {
            "eaten_on": "2026-10-26",
            "entries": [
                {"food_id": "f-apple", "servings": 1},
                {"food_id": "f-gone", "servings": 2},
            ],
        },
    )

    assert result["results"] == [
        {"food_id": "f-apple", "ok": True, "log_id": "l2", "food_name": "Apple"},
        {"food_id": "f-gone", "ok": False, "error": "Disci API error 404: food not found"},
    ]
    calories, protein = result["day"]["nutrients"]
    assert calories == {"nutrient": "calories", "unit": "kcal", "total": "90.054", "limit": "2000"}
    assert protein["total"] is None and protein["missing_foods"] == ["Greek yogurt"]
    assert result["day"]["entries"][0]["serving"] == "170 g"


def test_update_food_log_keeps_what_isnt_passed(nutrition: FakeApi) -> None:
    nutrition.routes[("PUT", "/nutrition/logs/l1")] = {}
    call_tool("update_food_log", {"log_id": "l1", "eaten_on": "2026-10-26", "servings": 2})
    assert nutrition.sent("PUT", "/nutrition/logs/l1") == [
        {"eaten_on": "2026-10-26", "servings": "2", "notes": None}
    ]

    with pytest.raises(AssertionError, match="No log entry nope"):
        call_tool("update_food_log", {"log_id": "nope", "eaten_on": "2026-10-26"})


def test_set_goal_updates_or_creates(nutrition: FakeApi) -> None:
    new = {"id": "g2", "nutrient": "calories", "kind": "limit", "amount": "1800.00",
           "starts_on": "2026-10-26", "ends_on": None}  # fmt: skip
    nutrition.routes[("PUT", "/nutrition/goals/g1")] = new
    result = call_tool(
        "set_nutrition_goal", {"nutrient": "calories", "kind": "limit", "amount": 1800}
    )
    assert result == {"nutrient": "calories", "kind": "limit", "amount": "1800",
                      "previous_amount": "2000", "starts_on": "2026-10-26"}  # fmt: skip

    target = {**new, "id": "g3", "kind": "target", "nutrient": "protein_g", "amount": "120.00"}
    nutrition.routes[("POST", "/nutrition/goals")] = target
    result = call_tool(
        "set_nutrition_goal", {"nutrient": "protein_g", "kind": "target", "amount": 120}
    )
    assert nutrition.sent("POST", "/nutrition/goals") == [
        {"nutrient": "protein_g", "kind": "target", "amount": "120"}
    ]
    assert result["previous_amount"] is None
