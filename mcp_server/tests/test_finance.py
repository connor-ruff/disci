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


def test_resolve_reports_each_outcome(fake_api: FakeApi) -> None:
    def missing(body: dict) -> None:
        raise ToolError("Disci API error 404: open inbox entry not found")

    resolved = {**TXN, "amount": "170.00", "allocations": [
        {"budget_item_id": "i1", "budget_item_name": "Electric", "budget_name": "October 2026",
         "budget_item_kind": "expense", "budget_id": "b-oct", "amount": "170.00"}]}  # fmt: skip
    fake_api.routes[("POST", "/finance/inbox/e1/resolve")] = resolved
    fake_api.routes[("POST", "/finance/inbox/e2/resolve")] = missing

    result = call_tool(
        "resolve_inbox_entries",
        {
            "decisions": [
                {"entry_id": "e1", "budget_item_ids": ["i1"], "amount": 170},
                {"entry_id": "e2", "budget_item_ids": ["i9"]},
            ]
        },
    )

    assert fake_api.sent("POST", "/finance/inbox/e1/resolve") == [
        {"budget_item_ids": ["i1"], "amount": "170"}
    ]
    ok, failed = result["results"]
    assert ok["ok"] and ok["result"]["counts_toward"][0]["budget_item_name"] == "Electric"
    assert failed == {"id": "e2", "ok": False,
                      "error": "Disci API error 404: open inbox entry not found"}  # fmt: skip


def test_dismiss_and_delete(fake_api: FakeApi) -> None:
    fake_api.routes[("POST", "/finance/inbox/e1/dismiss")] = None
    fake_api.routes[("DELETE", "/finance/transactions/t2")] = None

    assert call_tool("dismiss_inbox_entries", {"entry_ids": ["e1"]}) == {
        "results": [{"id": "e1", "ok": True}]
    }
    assert call_tool("delete_transaction", {"transaction_id": "t2"}) == {"deleted": "t2"}


def test_inbox_and_checklist(fake_api: FakeApi) -> None:
    def entry(id_: str, kind: str, budget: bool, item: bool) -> dict:
        return {
            "id": id_, "kind": kind, "created_at": "2026-10-26T12:00:00Z", "seen": False,
            "transaction": {**TXN, "status": "pending" if kind == "place" else "confirmed",
                            "recurring_name": "Rent"},
            "item_name": "Rent", "category_id": None, "category_name": None,
            "budget_id": "b-oct" if budget else None,
            "budget_name": "October 2026" if budget else None,
            "budget_item_id": "i1" if item else None, "budget_item_name": "Rent" if item else None,
            "allocations": [],
        }  # fmt: skip

    fake_api.routes[("GET", "/finance/inbox")] = {
        "needs_you": [entry("e1", "place", False, False), entry("e2", "pick_item", True, False)],
        "unassigned": [],
        "ledger": [entry("e3", "applied", True, True)],
        "unseen": 1,
    }
    fake_api.routes[("GET", "/finance/checklist")] = [
        {"budget_id": "b-oct", "budget_name": "October 2026", "item_id": "i1",
         "item_name": "Rent", "kind": "expense", "checklist_day": 1,
         "checklist_mode": "full_amount",
         "planned_amount": "1400.00", "actual_amount": "1400.00", "due_on": "2026-10-01",
         "done": True, "last_payment_on": "2026-10-01"},
        {"budget_id": "b-oct", "budget_name": "October 2026", "item_id": "i2",
         "item_name": "Phone", "kind": "expense", "checklist_day": 15,
         "checklist_mode": "any_payment",
         "planned_amount": "60.00", "actual_amount": "0.00", "due_on": "2026-10-15",
         "done": False, "last_payment_on": None},
    ]  # fmt: skip

    inbox = call_tool("get_transaction_inbox", {})
    place, pick = inbox["needs_you"]
    assert place["kind"] == "place"
    assert place["meant_for"] == {"item": "Rent", "category": "Uncategorized"}
    assert "budget" not in place
    assert pick["budget"] == {"id": "b-oct", "name": "October 2026"}
    assert inbox["applied"][0]["item"] == {"id": "i1", "name": "Rent"}
    assert inbox["applied"][0]["seen"] is False

    checklist = call_tool("get_monthly_checklist", {})
    assert (checklist["done"], checklist["left"]) == (1, 1)
    assert [i["name"] for i in checklist["items"]] == ["Rent", "Phone"]
    assert checklist["items"][1]["done_when"] == "any_payment"
