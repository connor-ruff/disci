import pytest
from mcp.server.fastmcp.exceptions import ToolError

from tests.conftest import FakeApi, call_tool

BUDGETS = [
    {"id": "b-week", "name": "Week of Oct 26", "period_type": "week",
     "period_start": "2026-10-26", "period_end": "2026-11-01", "notes": None},
    {"id": "b-oct", "name": "October 2026", "period_type": "month",
     "period_start": "2026-10-01", "period_end": "2026-10-31", "notes": None},
    {"id": "b-sep", "name": "September 2026", "period_type": "month",
     "period_start": "2026-09-01", "period_end": "2026-09-30", "notes": None},
]  # fmt: skip

TXN = {
    "id": "t1", "kind": "expense", "amount": "69.12", "occurred_on": "2026-10-26",
    "payee": "Trader Joe's", "description": None, "notes": None, "status": "confirmed",
    "recurring_transaction_id": None,
}  # fmt: skip


def detail(budget: dict) -> dict:
    item = {
        "id": "i1", "kind": "expense", "name": "Groceries", "category_id": None,
        "category_name": "Food", "planned_amount": "400.00", "actual_amount": "425.50",
        "pending_amount": "0.00", "is_checklist_item": False, "checklist_day": None,
        "checklist_done": False, "sort_order": 0,
    }  # fmt: skip
    return {
        **budget,
        "items": [item],
        "income": {"planned": "5000.00", "actual": "2500.00"},
        "expense": {"planned": "400.00", "actual": "425.50"},
    }


@pytest.fixture
def budgets(fake_api: FakeApi) -> FakeApi:
    fake_api.routes[("GET", "/finance/budgets")] = BUDGETS
    for b in BUDGETS:
        fake_api.routes[("GET", f"/finance/budgets/{b['id']}")] = detail(b)
    return fake_api


def allocated(*items: tuple[str, str]) -> dict:
    allocations = [
        {"budget_item_id": i, "budget_item_name": i, "budget_item_kind": "expense",
         "budget_id": "b-oct", "budget_name": "October 2026", "amount": a}
        for i, a in items
    ]  # fmt: skip
    return {**TXN, "allocations": allocations}


def test_budget_summary_returns_every_covering_budget(budgets: FakeApi) -> None:
    result = call_tool("get_budget_summary", {"on_date": "2026-10-27"})

    assert [b["name"] for b in result["budgets"]] == ["Week of Oct 26", "October 2026"]
    october = result["budgets"][1]
    assert october["income"] == {"planned": "5000.00", "actual": "2500.00", "remaining": "2500.00"}
    assert october["items"][0]["remaining"] == "-25.50"  # over budget
    assert (october["days_elapsed"], october["days_in_period"]) == (27, 31)
    assert ("GET", "/me", None) not in budgets.calls  # a date was given: no timezone lookup


def test_budget_summary_defaults_to_today_and_notes_gaps(budgets: FakeApi) -> None:
    result = call_tool("get_budget_summary", {"on_date": "2027-03-01"})
    assert result["budgets"] == []
    assert result["note"] == "No budget covers this date."
    assert len(result["recent_budgets"]) == 3

    budgets.calls.clear()
    call_tool("get_budget_summary", {})
    assert [p for _, p, _ in budgets.calls[:2]] == ["/me", "/finance/budgets"]


def test_log_transaction_counts_the_full_amount_toward_each_item(fake_api: FakeApi) -> None:
    fake_api.routes[("POST", "/finance/transactions")] = TXN
    fake_api.routes[("GET", "/finance/transactions/t1")] = allocated(("i1", "69.12"))

    result = call_tool(
        "log_transaction",
        {"amount": 69.12, "payee": "Trader Joe's", "budget_item_ids": ["i1", "i-week"]},
    )

    [body] = fake_api.sent("POST", "/finance/transactions")
    assert body["amount"] == "69.12"
    assert body["kind"] == "expense"
    assert body["allocations"] == [
        {"budget_item_id": "i1", "amount": "69.12"},
        {"budget_item_id": "i-week", "amount": "69.12"},
    ]
    assert body["occurred_on"]  # today, from /me's timezone
    assert result["counts_toward"][0]["budget_item_name"] == "i1"


def test_update_transaction_keeps_what_isnt_passed(fake_api: FakeApi) -> None:
    fake_api.routes[("GET", "/finance/transactions/t1")] = allocated(
        ("i-full", "69.12"), ("i-part", "20.00")
    )
    fake_api.routes[("PUT", "/finance/transactions/t1")] = allocated()

    call_tool("update_transaction", {"transaction_id": "t1", "amount": 61})

    [body] = fake_api.sent("PUT", "/finance/transactions/t1")
    assert body["amount"] == "61"
    assert body["payee"] == "Trader Joe's"
    assert body["occurred_on"] == "2026-10-26"
    assert body["allocations"] == [
        {"budget_item_id": "i-full", "amount": "61"},  # followed the amount
        {"budget_item_id": "i-part", "amount": "20.00"},  # partial: kept
    ]


def test_approve_reports_each_outcome(fake_api: FakeApi) -> None:
    def missing(body: dict) -> None:
        raise ToolError("Disci API error 404: pending transaction not found")

    fake_api.routes[("POST", "/finance/transactions/t1/approve")] = {**TXN, "amount": "1450.00"}
    fake_api.routes[("POST", "/finance/transactions/t2/approve")] = missing

    result = call_tool(
        "approve_transactions",
        {"approvals": [{"transaction_id": "t1", "amount": 1450}, {"transaction_id": "t2"}]},
    )

    assert fake_api.sent("POST", "/finance/transactions/t1/approve") == [{"amount": "1450"}]
    assert fake_api.sent("POST", "/finance/transactions/t2/approve") == [{"amount": None}]
    ok, failed = result["results"]
    assert ok["ok"] and ok["result"]["amount"] == "1450.00"
    assert failed["id"] == "t2" and not failed["ok"]
    assert failed["error"] == "Disci API error 404: pending transaction not found"


def test_reject_and_delete(fake_api: FakeApi) -> None:
    fake_api.routes[("POST", "/finance/transactions/t1/reject")] = None
    fake_api.routes[("DELETE", "/finance/transactions/t2")] = None

    assert call_tool("reject_transactions", {"transaction_ids": ["t1"]}) == {
        "results": [{"id": "t1", "ok": True}]
    }
    assert call_tool("delete_transaction", {"transaction_id": "t2"}) == {"deleted": "t2"}


def test_inbox_and_checklist(fake_api: FakeApi) -> None:
    pending = {**TXN, "status": "pending", "recurring_name": "Rent"}
    fake_api.routes[("GET", "/finance/inbox")] = {"pending": [pending], "unassigned": []}
    fake_api.routes[("GET", "/finance/checklist")] = [
        {"budget_id": "b-oct", "budget_name": "October 2026", "item_id": "i1",
         "item_name": "Rent", "kind": "expense", "checklist_day": 1,
         "planned_amount": "1400.00", "actual_amount": "1400.00", "due_on": "2026-10-01",
         "done": True, "last_payment_on": "2026-10-01"},
        {"budget_id": "b-oct", "budget_name": "October 2026", "item_id": "i2",
         "item_name": "Phone", "kind": "expense", "checklist_day": 15,
         "planned_amount": "60.00", "actual_amount": "0.00", "due_on": "2026-10-15",
         "done": False, "last_payment_on": None},
    ]  # fmt: skip

    inbox = call_tool("get_transaction_inbox", {})
    assert inbox["pending"][0]["recurring_name"] == "Rent"

    checklist = call_tool("get_monthly_checklist", {})
    assert (checklist["done"], checklist["left"]) == (1, 1)
    assert [i["name"] for i in checklist["items"]] == ["Rent", "Phone"]
