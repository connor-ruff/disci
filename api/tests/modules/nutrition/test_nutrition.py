from datetime import date, timedelta

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.modules.nutrition.service import DEFAULT_TRACKED, NUTRIENT_KEYS
from tests.conftest import OWNER_URL, as_user

ALICE = as_user("alice")
BOB = as_user("bob")
DAY = "2026-10-20"


@pytest.fixture
def nutrition_on(client: TestClient) -> None:
    client.put("/me/modules/nutrition", headers=ALICE)


def add_food(client: TestClient, headers=ALICE, **body) -> dict:
    body = {"standard_quantity": "100", "standard_unit": "g"} | body
    resp = client.post("/nutrition/foods", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def log(client: TestClient, food_id: str, servings: str, day: str = DAY, headers=ALICE):
    body = {"food_item_id": food_id, "eaten_on": day, "servings": servings}
    return client.post("/nutrition/logs", json=body, headers=headers)


def totals(day: dict) -> dict[str, dict]:
    return {t["nutrient"]: t for t in day["totals"]}


# --- Preferences ---------------------------------------------------------------------


def test_enabling_tracks_default_nutrients(client: TestClient, nutrition_on) -> None:
    prefs = client.get("/nutrition/preferences", headers=ALICE).json()
    assert prefs["tracked_nutrients"] == [k for k in NUTRIENT_KEYS if k in DEFAULT_TRACKED]
    assert [n["key"] for n in prefs["nutrients"]] == NUTRIENT_KEYS
    assert prefs["nutrients"][0] == {"key": "calories", "label": "Calories", "unit": "kcal"}


def test_tracked_nutrients_are_saved_in_display_order(client: TestClient, nutrition_on) -> None:
    body = {"tracked_nutrients": ["sodium_mg", "calories", "fiber_g", "calories"]}
    resp = client.put("/nutrition/preferences", json=body, headers=ALICE)
    assert resp.json()["tracked_nutrients"] == ["calories", "sodium_mg", "fiber_g"]
    bad = {"tracked_nutrients": ["vitamin_c"]}
    assert client.put("/nutrition/preferences", json=bad, headers=ALICE).status_code == 422


# --- Food repo ---------------------------------------------------------------------------


def test_food_names_are_unique_per_user_ignoring_case(client: TestClient, nutrition_on) -> None:
    food = add_food(client, name="Broccoli", calories="34", sodium_mg=None)
    assert food["sodium_mg"] is None  # unknown, not 0
    assert food["calories"] == "34.000000"
    resp = client.post(
        "/nutrition/foods",
        json={"name": " broccoli ", "standard_quantity": "1", "standard_unit": "cup"},
        headers=ALICE,
    )
    assert resp.status_code == 409
    # Another user may use the name, and so may Alice once it's deleted.
    add_food(client, headers=BOB, name="Broccoli")
    assert client.delete(f"/nutrition/foods/{food['id']}", headers=ALICE).status_code == 204
    add_food(client, name="Broccoli")


def test_editing_a_food_recalculates_past_days(client: TestClient, nutrition_on) -> None:
    oats = add_food(client, name="Oats", standard_quantity="40", protein_g="5")
    log(client, oats["id"], "2")
    body = {"name": "Oats", "standard_quantity": "40", "standard_unit": "g", "protein_g": "6"}
    assert client.put(f"/nutrition/foods/{oats['id']}", json=body, headers=ALICE).status_code == 200
    day = client.get(f"/nutrition/days/{DAY}", headers=ALICE).json()
    assert totals(day)["protein_g"]["amount"] == "12.000000"


# --- Daily log -----------------------------------------------------------------------------


def test_day_totals_multiply_servings_and_report_missing_values(
    client: TestClient, nutrition_on
) -> None:
    broccoli = add_food(client, name="Broccoli", calories="34", sodium_mg="33")
    banana = add_food(
        client, name="Banana", standard_quantity="1", standard_unit="piece", calories="105"
    )
    assert log(client, broccoli["id"], "1.2").status_code == 201
    assert log(client, banana["id"], "2").status_code == 201

    day = client.get(f"/nutrition/days/{DAY}", headers=ALICE).json()
    assert [e["food_name"] for e in day["entries"]] == ["Broccoli", "Banana"]
    first = day["entries"][0]
    assert (first["servings"], first["standard_quantity"], first["standard_unit"]) == (
        "1.200000",
        "100.000000",
        "g",
    )
    assert first["nutrients"]["calories"] == "40.800000"

    t = totals(day)
    assert t["calories"] == {"nutrient": "calories", "amount": "250.800000", "missing_foods": []}
    # Banana has no sodium value: the total covers Broccoli only and says so.
    assert t["sodium_mg"]["amount"] == "39.600000"
    assert t["sodium_mg"]["missing_foods"] == ["Banana"]
    # No food has protein: unknown, not 0.
    assert t["protein_g"]["amount"] is None
    assert t["protein_g"]["missing_foods"] == ["Banana", "Broccoli"]

    empty = client.get("/nutrition/days/2026-10-21", headers=ALICE).json()
    assert empty["entries"] == []
    assert totals(empty)["calories"]["amount"] == "0.000000"


def test_food_values_keep_six_decimal_places(client: TestClient, nutrition_on) -> None:
    yogurt = add_food(
        client, name="Yogurt", standard_quantity="1", standard_unit="oz", calories="20.889131"
    )
    assert yogurt["calories"] == "20.889131"
    assert log(client, yogurt["id"], "6.25").status_code == 201
    day = client.get(f"/nutrition/days/{DAY}", headers=ALICE).json()
    assert day["entries"][0]["servings"] == "6.250000"
    assert totals(day)["calories"]["amount"] == "130.557069"  # 130.55706875, to 6 places

    too_fine = {
        "name": "Dust",
        "standard_quantity": "1",
        "standard_unit": "g",
        "calories": "0.0000001",
    }
    assert client.post("/nutrition/foods", json=too_fine, headers=ALICE).status_code == 422


def test_edit_and_delete_log_entries(client: TestClient, nutrition_on) -> None:
    rice = add_food(client, name="Rice", calories="130")
    entry = log(client, rice["id"], "1").json()
    body = {"eaten_on": "2026-10-21", "servings": "1.5", "notes": "dinner"}
    edited = client.put(f"/nutrition/logs/{entry['id']}", json=body, headers=ALICE).json()
    assert (edited["eaten_on"], edited["nutrients"]["calories"]) == ("2026-10-21", "195.000000")

    assert client.delete(f"/nutrition/logs/{entry['id']}", headers=ALICE).status_code == 204
    day = client.get("/nutrition/days/2026-10-21", headers=ALICE).json()
    assert day["entries"] == []
    assert log(client, rice["id"], "0").status_code == 422


def test_deleted_food_stays_on_past_days_but_cant_be_logged(
    client: TestClient, nutrition_on
) -> None:
    eggs = add_food(client, name="Eggs", standard_quantity="1", standard_unit="egg", protein_g="6")
    log(client, eggs["id"], "3")
    client.delete(f"/nutrition/foods/{eggs['id']}", headers=ALICE)

    day = client.get(f"/nutrition/days/{DAY}", headers=ALICE).json()
    assert day["entries"][0]["food_deleted"] is True
    assert totals(day)["protein_g"]["amount"] == "18.000000"
    assert log(client, eggs["id"], "1").status_code == 404


def test_history_lists_logged_days_newest_first(client: TestClient, nutrition_on) -> None:
    apple = add_food(client, name="Apple", standard_quantity="1", standard_unit="apple")
    for day in ("2026-10-18", "2026-10-20", "2026-10-20", "2026-10-22"):
        log(client, apple["id"], "1", day=day)

    page = client.get("/nutrition/days?limit=2", headers=ALICE).json()
    assert [(d["date"], d["entry_count"]) for d in page] == [("2026-10-22", 1), ("2026-10-20", 2)]
    rest = client.get("/nutrition/days?limit=2&before=2026-10-20", headers=ALICE).json()
    assert [d["date"] for d in rest] == ["2026-10-18"]


def quick_add(client: TestClient, day: str = DAY, headers=ALICE, **body):
    body = {"name": "Burrito", "eaten_on": day} | body
    return client.post("/nutrition/quick-logs", json=body, headers=headers)


def test_quick_add_counts_toward_the_day_but_not_the_repo(client: TestClient, nutrition_on) -> None:
    rice = add_food(client, name="Rice", calories="130", protein_g="3")
    log(client, rice["id"], "2")
    resp = quick_add(client, name="  Burrito  ", calories="600")
    assert resp.status_code == 201, resp.text
    entry = resp.json()
    assert (entry["food_item_id"], entry["food_name"], entry["servings"]) == (
        None,
        "Burrito",
        "1.000000",
    )
    assert (entry["standard_quantity"], entry["standard_unit"]) == (None, None)

    day = client.get(f"/nutrition/days/{DAY}", headers=ALICE).json()
    assert [e["food_name"] for e in day["entries"]] == ["Rice", "Burrito"]
    assert totals(day)["calories"]["amount"] == "860.000000"
    assert totals(day)["protein_g"]["missing_foods"] == ["Burrito"]  # unknown, not 0
    assert [f["name"] for f in client.get("/nutrition/foods", headers=ALICE).json()] == ["Rice"]


def test_edit_and_delete_quick_adds(client: TestClient, nutrition_on) -> None:
    entry = quick_add(client, calories="600").json()
    body = {"name": "Big burrito", "eaten_on": "2026-10-21", "calories": "800", "protein_g": "35"}
    resp = client.put(f"/nutrition/quick-logs/{entry['id']}", json=body, headers=ALICE)
    edited = resp.json()
    assert (edited["food_name"], edited["eaten_on"]) == ("Big burrito", "2026-10-21")
    assert edited["nutrients"]["protein_g"] == "35.000000"

    # Each kind of entry is edited at its own endpoint.
    servings = {"eaten_on": DAY, "servings": "2"}
    assert (
        client.put(f"/nutrition/logs/{entry['id']}", json=servings, headers=ALICE).status_code
        == 404
    )
    rice = log(client, add_food(client, name="Rice")["id"], "1").json()
    assert (
        client.put(f"/nutrition/quick-logs/{rice['id']}", json=body, headers=ALICE).status_code
        == 404
    )

    assert client.delete(f"/nutrition/logs/{entry['id']}", headers=ALICE).status_code == 204
    assert client.get("/nutrition/days/2026-10-21", headers=ALICE).json()["entries"] == []
    assert quick_add(client, name="").status_code == 422
    assert quick_add(client, headers=BOB).status_code == 201  # each user's own
    assert len(client.get(f"/nutrition/days/{DAY}", headers=ALICE).json()["entries"]) == 1


def test_users_cant_see_or_log_each_others_foods(client: TestClient, nutrition_on) -> None:
    food = add_food(client, name="Secret sauce")
    log(client, food["id"], "1")
    assert client.get("/nutrition/foods", headers=BOB).json() == []
    assert client.get(f"/nutrition/days/{DAY}", headers=BOB).json()["entries"] == []
    assert log(client, food["id"], "1", headers=BOB).status_code == 404


# --- Goals -------------------------------------------------------------------------------


def backdate_goals(days: int) -> None:
    """Moves every goal `days` earlier, as if it had been set that long ago."""
    with psycopg.connect(OWNER_URL) as conn:
        conn.execute(
            "UPDATE nutrition.macro_goals"
            " SET starts_on = starts_on - %(d)s, ends_on = ends_on - %(d)s",
            {"d": days},
        )


def test_goals_targets_and_limits(client: TestClient, nutrition_on) -> None:
    protein = {"nutrient": "protein_g", "kind": "target", "amount": "150"}
    sodium = {"nutrient": "sodium_mg", "kind": "limit", "amount": "1750"}
    for body in (protein, sodium):
        assert client.post("/nutrition/goals", json=body, headers=ALICE).status_code == 201
    assert client.post("/nutrition/goals", json=protein, headers=ALICE).status_code == 409
    # A limit on the same nutrient as a target is fine.
    protein_cap = {"nutrient": "protein_g", "kind": "limit", "amount": "220"}
    assert client.post("/nutrition/goals", json=protein_cap, headers=ALICE).status_code == 201

    goals = client.get("/nutrition/goals", headers=ALICE).json()
    assert [(g["kind"], g["nutrient"]) for g in goals] == [
        ("target", "protein_g"),
        ("limit", "protein_g"),
        ("limit", "sodium_mg"),
    ]
    assert client.get("/nutrition/goals", headers=BOB).json() == []


def test_changing_a_goal_keeps_history(client: TestClient, nutrition_on) -> None:
    body = {"nutrient": "calories", "kind": "limit", "amount": "2000"}
    goal = client.post("/nutrition/goals", json=body, headers=ALICE).json()

    # Changed the day it started: edited in place.
    same = client.put(f"/nutrition/goals/{goal['id']}", json={"amount": "2100"}, headers=ALICE)
    assert (same.json()["id"], same.json()["amount"]) == (goal["id"], "2100.00")

    # Changed later: the old amount still covers earlier days.
    backdate_goals(10)
    today = date.fromisoformat(goal["starts_on"])
    new = client.put(
        f"/nutrition/goals/{goal['id']}", json={"amount": "1800"}, headers=ALICE
    ).json()
    assert new["id"] != goal["id"] and new["starts_on"] == today.isoformat()
    last_week = (today - timedelta(7)).isoformat()
    past = client.get(f"/nutrition/goals?on={last_week}", headers=ALICE).json()
    assert [(g["amount"], g["ends_on"]) for g in past] == [
        ("2100.00", (today - timedelta(1)).isoformat())
    ]

    # Deleting ends it today; earlier days keep it.
    backdate_goals(3)
    assert client.delete(f"/nutrition/goals/{new['id']}", headers=ALICE).status_code == 204
    assert client.get("/nutrition/goals", headers=ALICE).json() == []
    yesterday = (today - timedelta(1)).isoformat()
    ended = client.get(f"/nutrition/goals?on={yesterday}", headers=ALICE).json()
    assert [g["amount"] for g in ended] == ["1800.00"]
