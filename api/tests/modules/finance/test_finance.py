from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.modules.finance.service import DEFAULT_EXPENSE_CATEGORIES, period_bounds
from tests.conftest import as_user

ALICE = as_user("alice")
BOB = as_user("bob")


@pytest.fixture
def finance_on(client: TestClient) -> None:
    client.put("/me/modules/finance", headers=ALICE)


def categories(client: TestClient, headers: dict[str, str] = ALICE) -> dict[str, dict]:
    return {c["name"]: c for c in client.get("/finance/categories", headers=headers).json()}


def new_budget(client: TestClient, headers: dict[str, str] = ALICE, **body) -> dict:
    body = {"period_type": "month", "period_date": "2026-10-17"} | body
    resp = client.post("/finance/budgets", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def add_item(client: TestClient, budget_id: str, headers=ALICE, **body) -> dict:
    """Adds an item and returns it (found by name in the returned budget)."""
    resp = client.post(f"/finance/budgets/{budget_id}/items", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return next(i for i in resp.json()["items"] if i["name"] == body["name"])


def log(client: TestClient, item_id: str | None, kind: str, amount: str, headers=ALICE):
    allocations = [{"budget_item_id": item_id, "amount": amount}] if item_id else []
    return client.post(
        "/finance/transactions",
        json={
            "kind": kind,
            "amount": amount,
            "occurred_on": "2026-10-18",
            "allocations": allocations,
        },
        headers=headers,
    )


# --- Periods (pure) --------------------------------------------------------------


@pytest.mark.parametrize(
    ("period_type", "day", "week_starts_on", "expected"),
    [
        ("month", date(2026, 2, 14), 1, (date(2026, 2, 1), date(2026, 2, 28))),
        ("year", date(2026, 7, 4), 1, (date(2026, 1, 1), date(2026, 12, 31))),
        ("week", date(2026, 10, 22), 1, (date(2026, 10, 19), date(2026, 10, 25))),  # Thu, Mon start
        ("week", date(2026, 10, 22), 7, (date(2026, 10, 18), date(2026, 10, 24))),  # Sun start
        ("week", date(2026, 10, 19), 1, (date(2026, 10, 19), date(2026, 10, 25))),  # on the start
    ],
)
def test_period_bounds(period_type, day, week_starts_on, expected) -> None:
    assert period_bounds(period_type, day, week_starts_on) == expected


# --- Categories --------------------------------------------------------------------


def test_enabling_finance_seeds_expense_categories(client: TestClient, finance_on) -> None:
    cats = client.get("/finance/categories", headers=ALICE).json()
    assert [c["name"] for c in cats] == DEFAULT_EXPENSE_CATEGORIES
    assert {c["kind"] for c in cats} == {"expense"}

    # Re-enabling doesn't seed twice.
    client.delete("/me/modules/finance", headers=ALICE)
    client.put("/me/modules/finance", headers=ALICE)
    assert len(client.get("/finance/categories", headers=ALICE).json()) == 9


def test_custom_categories_per_kind(client: TestClient, finance_on) -> None:
    resp = client.post(
        "/finance/categories", json={"kind": "income", "name": "Salary"}, headers=ALICE
    )
    assert resp.status_code == 201
    # Same name under the other kind is fine; a duplicate within a kind is not.
    assert (
        client.post(
            "/finance/categories", json={"kind": "expense", "name": "Salary"}, headers=ALICE
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/finance/categories", json={"kind": "income", "name": "salary"}, headers=ALICE
        ).status_code
        == 409
    )


def test_deleting_category_uncategorizes_items(client: TestClient, finance_on) -> None:
    food = categories(client)["Food"]
    budget = new_budget(client)
    item = add_item(
        client,
        budget["id"],
        kind="expense",
        name="Groceries",
        category_id=food["id"],
        planned_amount="400",
    )
    assert item["category_name"] == "Food"

    assert client.delete(f"/finance/categories/{food['id']}", headers=ALICE).status_code == 204
    items = client.get(f"/finance/budgets/{budget['id']}", headers=ALICE).json()["items"]
    assert items[0]["category_id"] is None


# --- Budgets and items ---------------------------------------------------------------


def test_create_budget_snaps_period_and_names_it(client: TestClient, finance_on) -> None:
    budget = new_budget(client)
    assert (budget["period_start"], budget["period_end"]) == ("2026-10-01", "2026-10-31")
    assert budget["name"] == "October 2026"


def test_multiple_budgets_per_period(client: TestClient, finance_on) -> None:
    new_budget(client)
    new_budget(client, name="October – Vacation")
    names = [b["name"] for b in client.get("/finance/budgets", headers=ALICE).json()]
    assert sorted(names) == ["October 2026", "October – Vacation"]


def test_items_can_be_uncategorized(client: TestClient, finance_on) -> None:
    budget = new_budget(client)
    item = add_item(client, budget["id"], kind="income", name="Side gig", planned_amount="200")
    assert item["category_id"] is None


def test_item_category_must_match_kind(client: TestClient, finance_on) -> None:
    budget = new_budget(client)
    food = categories(client)["Food"]  # an expense category
    resp = client.post(
        f"/finance/budgets/{budget['id']}/items",
        json={
            "kind": "income",
            "name": "Paycheck",
            "category_id": food["id"],
            "planned_amount": "3000",
        },
        headers=ALICE,
    )
    assert resp.status_code == 422


# --- Transactions and actuals ------------------------------------------------------


def test_opposite_kind_transactions_net_against_item(client: TestClient, finance_on) -> None:
    budget = new_budget(client)
    groceries = add_item(
        client, budget["id"], kind="expense", name="Groceries", planned_amount="400"
    )

    assert log(client, groceries["id"], "expense", "380.00").status_code == 201
    assert log(client, groceries["id"], "income", "25.00").status_code == 201  # rebate

    detail = client.get(f"/finance/budgets/{budget['id']}", headers=ALICE).json()
    assert detail["items"][0]["actual_amount"] == "355.00"
    assert detail["expense"] == {"planned": "400.00", "actual": "355.00"}
    assert detail["income"] == {"planned": "0.00", "actual": "0.00"}


def test_allocations_within_one_budget_cant_exceed_amount(client: TestClient, finance_on) -> None:
    budget = new_budget(client)
    a = add_item(client, budget["id"], kind="expense", name="Groceries", planned_amount="400")
    b = add_item(client, budget["id"], kind="expense", name="Household", planned_amount="100")

    def split(x: str, y: str):
        return client.post(
            "/finance/transactions",
            json={
                "kind": "expense",
                "amount": "65.00",
                "occurred_on": "2026-10-18",
                "allocations": [
                    {"budget_item_id": a["id"], "amount": x},
                    {"budget_item_id": b["id"], "amount": y},
                ],
            },
            headers=ALICE,
        )

    assert split("40.00", "25.00").status_code == 201  # a split
    assert split("40.00", "30.00").status_code == 422  # $70 of a $65 transaction


def test_same_dollars_can_count_in_two_budgets(client: TestClient, finance_on) -> None:
    month = new_budget(client)
    year = new_budget(client, period_type="year")
    m = add_item(client, month["id"], kind="expense", name="Dining", planned_amount="150")
    y = add_item(client, year["id"], kind="expense", name="Dining", planned_amount="1800")
    resp = client.post(
        "/finance/transactions",
        json={
            "kind": "expense",
            "amount": "30.00",
            "occurred_on": "2026-10-18",
            "allocations": [
                {"budget_item_id": m["id"], "amount": "30.00"},
                {"budget_item_id": y["id"], "amount": "30.00"},
            ],
        },
        headers=ALICE,
    )
    assert resp.status_code == 201
    for budget in (month, year):
        detail = client.get(f"/finance/budgets/{budget['id']}", headers=ALICE).json()
        assert detail["expense"]["actual"] == "30.00"


def test_deleting_transaction_removes_it_from_actuals(client: TestClient, finance_on) -> None:
    budget = new_budget(client)
    item = add_item(client, budget["id"], kind="expense", name="Gas", planned_amount="120")
    txn = log(client, item["id"], "expense", "45.00").json()

    listed = client.get(f"/finance/budgets/{budget['id']}/transactions", headers=ALICE).json()
    assert [t["budget_item_name"] for t in listed] == ["Gas"]

    assert client.delete(f"/finance/transactions/{txn['id']}", headers=ALICE).status_code == 204
    detail = client.get(f"/finance/budgets/{budget['id']}", headers=ALICE).json()
    assert detail["items"][0]["actual_amount"] == "0.00"


# --- Isolation ---------------------------------------------------------------------


def test_users_cant_see_or_touch_each_others_budgets(client: TestClient, finance_on) -> None:
    budget = new_budget(client)
    item = add_item(client, budget["id"], kind="expense", name="Groceries", planned_amount="400")

    assert client.get("/finance/budgets", headers=BOB).json() == []
    assert client.get(f"/finance/budgets/{budget['id']}", headers=BOB).status_code == 404
    assert client.delete(f"/finance/items/{item['id']}", headers=BOB).status_code == 404
    # Bob can't allocate his transaction to Alice's item, even knowing its id.
    assert log(client, item["id"], "expense", "10.00", headers=BOB).status_code == 422


# --- Copying a budget ----------------------------------------------------------------


def test_new_budget_can_copy_items_from_another(client: TestClient, finance_on) -> None:
    october = new_budget(client)
    food = categories(client)["Food"]
    groceries = add_item(
        client,
        october["id"],
        kind="expense",
        name="Groceries",
        category_id=food["id"],
        planned_amount="450",
    )
    add_item(client, october["id"], kind="income", name="Paycheck", planned_amount="4200")
    log(client, groceries["id"], "expense", "100.00")

    november = new_budget(client, period_date="2026-11-03", copy_from_budget_id=october["id"])
    assert november["name"] == "November 2026"

    detail = client.get(f"/finance/budgets/{november['id']}", headers=ALICE).json()
    copied = {i["name"]: i for i in detail["items"]}
    assert set(copied) == {"Groceries", "Paycheck"}
    assert copied["Groceries"]["category_name"] == "Food"
    assert copied["Groceries"]["planned_amount"] == "450.00"
    assert copied["Groceries"]["actual_amount"] == "0.00"  # transactions aren't copied
    assert client.get(f"/finance/budgets/{november['id']}/transactions", headers=ALICE).json() == []


def test_copy_requires_same_period_type(client: TestClient, finance_on) -> None:
    month = new_budget(client)
    resp = client.post(
        "/finance/budgets",
        json={
            "period_type": "year",
            "period_date": "2026-01-01",
            "copy_from_budget_id": month["id"],
        },
        headers=ALICE,
    )
    assert resp.status_code == 422


def test_cant_copy_another_users_budget(client: TestClient, finance_on) -> None:
    alices = new_budget(client)
    resp = client.post(
        "/finance/budgets",
        json={
            "period_type": "month",
            "period_date": "2026-11-01",
            "copy_from_budget_id": alices["id"],
        },
        headers=BOB,
    )
    assert resp.status_code == 422
