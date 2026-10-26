from datetime import UTC, date, datetime, timedelta

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.rows import dict_row

from app.core.db import queries as core_queries
from app.modules.finance.recurring import Schedule, generate_for_user, occurrences
from tests.conftest import OWNER_URL
from tests.modules.finance.test_finance import ALICE, BOB, add_item, categories, new_budget

API_URL = OWNER_URL.replace("disci:disci@", "disci_api:disci_api@")
TOMORROW = (date.today() + timedelta(days=1)).isoformat()


@pytest.fixture
def finance_on(client: TestClient) -> None:
    client.put("/me/modules/finance", headers=ALICE)


def make_rule(client: TestClient, headers=ALICE, **body) -> dict:
    """Creates a rule dated tomorrow, so saving it can't generate anything yet."""
    body = {
        "kind": "expense",
        "name": "Netflix",
        "amount": "15.49",
        "frequency": "monthly",
        "day_of_month": 12,
        "starts_on": TOMORROW,
    } | body
    resp = client.post("/finance/recurring", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def backdate(rule: dict, starts_on: str, created_on: str) -> None:
    """Pretends the rule was created on `created_on` and starts on `starts_on`."""
    with psycopg.connect(OWNER_URL) as conn:
        conn.execute(
            "UPDATE finance.recurring_transactions"
            " SET starts_on = %s, created_at = %s WHERE id = %s",
            (starts_on, created_on, rule["id"]),
        )


def generate(client: TestClient, today: str, headers=ALICE) -> int:
    """Runs generation for one user as of `today`, the way the job does."""
    user_id = client.get("/me", headers=headers).json()["id"]
    with psycopg.connect(API_URL, row_factory=dict_row) as conn, conn.transaction():
        conn.execute(core_queries["set_user"], {"user_id": user_id})
        return generate_for_user(conn, user_id, "UTC", date.fromisoformat(today))


def budget(client: TestClient, budget_id: str) -> dict:
    return client.get(f"/finance/budgets/{budget_id}", headers=ALICE).json()


def item_named(detail: dict, name: str) -> dict:
    return next(i for i in detail["items"] if i["name"] == name)


# --- Schedules (pure) ----------------------------------------------------------------


def sched(frequency, starts_on, *, dow=None, dom=None, ends_on=None) -> Schedule:
    return Schedule(
        frequency, dow, dom, date.fromisoformat(starts_on), ends_on and date.fromisoformat(ends_on)
    )


@pytest.mark.parametrize(
    ("schedule", "start", "end", "expected"),
    [
        (
            sched("monthly", "2026-01-01", dom=15),
            "2026-10-01",
            "2026-12-31",
            ["2026-10-15", "2026-11-15", "2026-12-15"],
        ),
        (
            sched("weekly", "2026-01-01", dow=4),
            "2026-10-01",
            "2026-10-31",  # Thursdays
            ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29"],
        ),
        (
            sched("quarterly", "2026-02-10"),
            "2026-01-01",
            "2026-12-31",
            ["2026-02-10", "2026-05-10", "2026-08-10", "2026-11-10"],
        ),
        (
            sched("yearly", "2028-02-29"),
            "2028-01-01",
            "2030-12-31",  # leap day clamps
            ["2028-02-29", "2029-02-28", "2030-02-28"],
        ),
        (
            sched("monthly", "2026-11-01", dom=1, ends_on="2027-01-31"),
            "2026-01-01",
            "2027-12-31",
            ["2026-11-01", "2026-12-01", "2027-01-01"],
        ),
    ],
)
def test_occurrences(schedule, start, end, expected) -> None:
    got = occurrences(schedule, date.fromisoformat(start), date.fromisoformat(end))
    assert [d.isoformat() for d in got] == expected


# --- Rules -------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "bad",
    [
        {"frequency": "monthly", "day_of_month": None},
        {"frequency": "monthly", "day_of_month": 31},
        {"frequency": "weekly", "day_of_month": None},  # weekly needs day_of_week
        {"frequency": "quarterly", "day_of_month": None, "starts_on": "2026-01-30"},
    ],
)
def test_rule_validation(client: TestClient, finance_on, bad) -> None:
    body = {
        "kind": "expense",
        "name": "X",
        "amount": "1",
        "frequency": "monthly",
        "day_of_month": 12,
        "starts_on": TOMORROW,
    } | bad
    assert client.post("/finance/recurring", json=body, headers=ALICE).status_code == 422


def test_rule_lists_next_occurrence(client: TestClient, finance_on) -> None:
    make_rule(client, frequency="yearly", day_of_month=None, starts_on="2099-03-15")
    rules = client.get("/finance/recurring", headers=ALICE).json()
    assert rules[0]["next_occurrence"] == "2099-03-15"


# --- Generation ---------------------------------------------------------------------------


def test_auto_apply_creates_item_and_is_idempotent(client: TestClient, finance_on) -> None:
    october = new_budget(client)
    personal = categories(client)["Personal"]
    rule = make_rule(client, auto_apply=True, category_id=personal["id"])
    backdate(rule, starts_on="2026-01-01", created_on="2026-10-01")

    assert generate(client, "2026-10-20") == 1  # Oct 12 only: nothing before creation
    netflix = item_named(budget(client, october["id"]), "Netflix")
    assert netflix["category_name"] == "Personal"
    assert (netflix["planned_amount"], netflix["actual_amount"]) == ("15.49", "15.49")

    assert generate(client, "2026-10-20") == 0  # already done


def test_auto_apply_plans_every_occurrence_in_the_budget(client: TestClient, finance_on) -> None:
    october = new_budget(client)
    # Saving logs anything due today (UTC, the user's timezone), so use a weekday that
    # isn't today's. Oct 2026 has 4 Mondays (5th..26th) and 4 Tuesdays (6th..27th).
    weekday = 2 if datetime.now(UTC).isoweekday() == 1 else 1
    rule = make_rule(
        client,
        name="Lunch",
        amount="20.00",
        frequency="weekly",
        day_of_month=None,
        day_of_week=weekday,
        auto_apply=True,
    )
    backdate(rule, starts_on="2026-10-01", created_on="2026-10-01")
    generate(client, "2026-10-06")
    lunch = item_named(budget(client, october["id"]), "Lunch")
    assert lunch["planned_amount"] == "80.00"  # 4 occurrences in Oct 2026
    assert lunch["actual_amount"] == "20.00"  # only Oct 5 (or 6) has happened


def test_auto_apply_matches_existing_item_by_name(client: TestClient, finance_on) -> None:
    october = new_budget(client)
    add_item(client, october["id"], kind="expense", name="Rent", planned_amount="1650")
    rule = make_rule(client, name="rent", amount="1650.00", day_of_month=1, auto_apply=True)
    backdate(rule, starts_on="2026-10-01", created_on="2026-10-01")
    generate(client, "2026-10-02")
    items = budget(client, october["id"])["items"]
    assert [(i["name"], i["actual_amount"]) for i in items] == [("Rent", "1650.00")]


def test_auto_apply_hits_every_covering_budget(client: TestClient, finance_on) -> None:
    month, year = new_budget(client), new_budget(client, period_type="year")
    rule = make_rule(client, auto_apply=True)
    backdate(rule, starts_on="2026-10-01", created_on="2026-10-01")
    generate(client, "2026-10-20")
    assert item_named(budget(client, month["id"]), "Netflix")["actual_amount"] == "15.49"
    yearly = item_named(budget(client, year["id"]), "Netflix")
    assert (yearly["planned_amount"], yearly["actual_amount"]) == ("46.47", "15.49")  # Oct-Dec


def test_without_auto_apply_it_lands_unassigned(client: TestClient, finance_on) -> None:
    october = new_budget(client)
    rule = make_rule(client)
    backdate(rule, starts_on="2026-10-01", created_on="2026-10-01")
    generate(client, "2026-10-20")

    unassigned = client.get("/finance/inbox", headers=ALICE).json()["unassigned"]
    assert [t["recurring_name"] for t in unassigned] == ["Netflix"]

    item = add_item(client, october["id"], kind="expense", name="Streaming", planned_amount="20")
    resp = client.put(
        f"/finance/transactions/{unassigned[0]['id']}/allocations",
        json={"allocations": [{"budget_item_id": item["id"], "amount": "15.49"}]},
        headers=ALICE,
    )
    assert resp.status_code == 200
    assert client.get("/finance/inbox", headers=ALICE).json()["unassigned"] == []
    assert item_named(budget(client, october["id"]), "Streaming")["actual_amount"] == "15.49"


def test_approval_flow(client: TestClient, finance_on) -> None:
    october = new_budget(client)
    rule = make_rule(
        client,
        name="Electric",
        amount="90.00",
        day_of_month=5,
        auto_apply=True,
        requires_approval=True,
    )
    backdate(rule, starts_on="2026-10-01", created_on="2026-10-01")
    generate(client, "2026-10-06")

    electric = item_named(budget(client, october["id"]), "Electric")
    assert (electric["actual_amount"], electric["pending_amount"]) == ("0.00", "90.00")

    pending = client.get("/finance/inbox", headers=ALICE).json()["pending"]
    assert len(pending) == 1
    approved = client.post(
        f"/finance/transactions/{pending[0]['id']}/approve", json={"amount": "84.17"}, headers=ALICE
    )
    assert approved.json()["status"] == "confirmed"
    electric = item_named(budget(client, october["id"]), "Electric")
    assert (electric["actual_amount"], electric["pending_amount"]) == ("84.17", "0.00")


def test_rejected_occurrence_never_comes_back(client: TestClient, finance_on) -> None:
    rule = make_rule(client, requires_approval=True)
    backdate(rule, starts_on="2026-10-01", created_on="2026-10-01")
    generate(client, "2026-10-20")
    pending = client.get("/finance/inbox", headers=ALICE).json()["pending"]
    assert (
        client.post(f"/finance/transactions/{pending[0]['id']}/reject", headers=ALICE).status_code
        == 204
    )
    assert generate(client, "2026-10-20") == 0
    assert client.get("/finance/inbox", headers=ALICE).json()["pending"] == []


def test_job_runs_for_every_user(client: TestClient, finance_on) -> None:
    from app.jobs.recurring import run

    client.put("/me/modules/finance", headers=BOB)
    for headers in (ALICE, BOB):
        rule = make_rule(client, headers=headers)
        # Due yesterday, created before that: exactly one occurrence as of real today.
        yesterday = date.today() - timedelta(days=1)
        backdate(
            rule,
            starts_on=yesterday.isoformat(),
            created_on=(yesterday - timedelta(days=1)).isoformat(),
        )
        with psycopg.connect(OWNER_URL) as conn:
            conn.execute(
                "UPDATE finance.recurring_transactions"
                " SET frequency = 'yearly', day_of_month = NULL WHERE id = %s",
                (rule["id"],),
            )
    assert run() == {"users": 2, "created": 2}
    assert run() == {"users": 2, "created": 0}
    # Each user only sees their own.
    assert len(client.get("/finance/inbox", headers=BOB).json()["unassigned"]) == 1


# --- Checklist ---------------------------------------------------------------------------


def pay(client: TestClient, item_id: str, amount: str, kind: str = "expense") -> None:
    resp = client.post(
        "/finance/transactions",
        json={
            "kind": kind,
            "amount": amount,
            "occurred_on": date.today().isoformat(),
            "allocations": [{"budget_item_id": item_id, "amount": amount}],
        },
        headers=ALICE,
    )
    assert resp.status_code == 201, resp.text


def test_checklist_is_done_when_actual_reaches_plan(client: TestClient, finance_on) -> None:
    current = new_budget(client, period_date=date.today().isoformat())
    rent = add_item(
        client,
        current["id"],
        kind="expense",
        name="Rent",
        planned_amount="1650",
        is_checklist_item=True,
        checklist_day=1,
    )
    add_item(client, current["id"], kind="expense", name="Fun", planned_amount="100")

    def rent_entry() -> dict:
        (entry,) = client.get("/finance/checklist", headers=ALICE).json()
        return entry

    entry = rent_entry()
    assert (entry["item_name"], entry["done"], entry["actual_amount"]) == ("Rent", False, "0.00")
    assert entry["due_on"] == current["period_start"]  # due on the 1st

    pay(client, rent["id"], "800.00")  # partial: strict, so not done yet
    assert (rent_entry()["done"], rent_entry()["actual_amount"]) == (False, "800.00")

    pay(client, rent["id"], "850.00")  # reaches the plan
    entry = rent_entry()
    assert (entry["done"], entry["last_payment_on"]) == (True, date.today().isoformat())
    assert item_named(budget(client, current["id"]), "Rent")["checklist_done"] is True


def test_checklist_ignores_pending_and_nets_credits(client: TestClient, finance_on) -> None:
    current = new_budget(client, period_date=date.today().isoformat())
    bill = add_item(
        client,
        current["id"],
        kind="expense",
        name="Phone",
        planned_amount="60",
        is_checklist_item=True,
        checklist_day=5,
    )
    pay(client, bill["id"], "60.00")
    pay(client, bill["id"], "10.00", kind="income")  # a refund drops it below plan
    assert client.get("/finance/checklist", headers=ALICE).json()[0]["done"] is False


def test_zero_planned_checklist_item_needs_something_logged(client: TestClient, finance_on) -> None:
    current = new_budget(client, period_date=date.today().isoformat())
    item = add_item(
        client,
        current["id"],
        kind="expense",
        name="Check mail",
        planned_amount="0",
        is_checklist_item=True,
        checklist_day=2,
    )
    assert client.get("/finance/checklist", headers=ALICE).json()[0]["done"] is False
    pay(client, item["id"], "1.00")
    assert client.get("/finance/checklist", headers=ALICE).json()[0]["done"] is True


def test_checklist_items_only_in_monthly_budgets(client: TestClient, finance_on) -> None:
    week = new_budget(client, period_type="week")
    resp = client.post(
        f"/finance/budgets/{week['id']}/items",
        json={
            "kind": "expense",
            "name": "Bill",
            "planned_amount": "10",
            "is_checklist_item": True,
            "checklist_day": 3,
        },
        headers=ALICE,
    )
    assert resp.status_code == 422


def test_recurring_payment_meeting_plan_ticks_checklist(client: TestClient, finance_on) -> None:
    october = new_budget(client)
    add_item(
        client,
        october["id"],
        kind="expense",
        name="Internet",
        planned_amount="70",
        is_checklist_item=True,
        checklist_day=8,
    )
    rule = make_rule(
        client,
        name="Internet",
        amount="70.00",
        day_of_month=8,
        auto_apply=True,
    )
    backdate(rule, starts_on="2026-10-01", created_on="2026-10-01")
    generate(client, "2026-10-09")
    assert item_named(budget(client, october["id"]), "Internet")["checklist_done"] is True


# --- Reordering, descriptions, notes ---------------------------------------------------


def test_reorder_categories_and_items(client: TestClient, finance_on) -> None:
    cats = client.get("/finance/categories", headers=ALICE).json()
    reversed_ids = [c["id"] for c in reversed(cats)]
    resp = client.put(
        "/finance/categories/order", json={"kind": "expense", "ids": reversed_ids}, headers=ALICE
    )
    assert [c["id"] for c in resp.json()] == reversed_ids

    october = new_budget(client)
    a = add_item(client, october["id"], kind="expense", name="A", planned_amount="1")
    b = add_item(client, october["id"], kind="expense", name="B", planned_amount="1")
    resp = client.put(
        f"/finance/budgets/{october['id']}/items/order",
        json={"ids": [b["id"], a["id"]]},
        headers=ALICE,
    )
    assert [i["name"] for i in resp.json()["items"]] == ["B", "A"]


def test_category_description_and_transaction_notes(client: TestClient, finance_on) -> None:
    resp = client.post(
        "/finance/categories",
        json={"kind": "expense", "name": "Hobbies", "description": "Guitar, climbing"},
        headers=ALICE,
    )
    assert resp.json()["description"] == "Guitar, climbing"
    assert categories(client)["Food"]["description"] is None  # defaults have none

    txn = client.post(
        "/finance/transactions",
        json={
            "kind": "expense",
            "amount": "5",
            "occurred_on": "2026-10-18",
            "notes": "split with Sam",
        },
        headers=ALICE,
    ).json()
    assert txn["notes"] == "split with Sam"


def test_deleting_category_uncategorizes_rules(client: TestClient, finance_on) -> None:
    food = categories(client)["Food"]
    rule = make_rule(client, name="Meal kit", category_id=food["id"])
    assert client.delete(f"/finance/categories/{food['id']}", headers=ALICE).status_code == 204
    rules = {r["id"]: r for r in client.get("/finance/recurring", headers=ALICE).json()}
    assert rules[rule["id"]]["category_id"] is None
