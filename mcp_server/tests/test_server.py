from typing import Any

import pytest

from disci_mcp import api
from tests.conftest import MCP_HEADERS, gateway_event, invoke, rpc

BUDGETS = [
    {"id": "b-week", "name": "Week of Oct 26", "period_type": "week",
     "period_start": "2026-10-26", "period_end": "2026-11-01", "notes": None},
    {"id": "b-oct", "name": "October 2026", "period_type": "month",
     "period_start": "2026-10-01", "period_end": "2026-10-31", "notes": None},
    {"id": "b-sep", "name": "September 2026", "period_type": "month",
     "period_start": "2026-09-01", "period_end": "2026-09-30", "notes": None},
]  # fmt: skip


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
def fake_api(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    calls: list[str] = []

    async def get(path: str, params: dict | None = None) -> Any:
        calls.append(path)
        if path == "/me":
            return {"timezone": "America/Chicago"}
        if path == "/finance/budgets":
            return BUDGETS
        return detail(next(b for b in BUDGETS if path.endswith(b["id"])))

    monkeypatch.setattr(api, "get", get)
    return calls


def call_tool(name: str, arguments: dict) -> dict:
    status, _, body = invoke(
        gateway_event("POST", "/mcp", rpc("tools/call", {"name": name, "arguments": arguments}))
    )
    assert status == 200
    return body["result"]


def test_handler_serves_repeated_invocations() -> None:
    """The session manager starts once per app; a warm Lambda must still serve call 2."""
    for _ in range(2):
        status, _, body = invoke(gateway_event("POST", "/mcp", rpc("tools/list")))
        assert status == 200
        assert [t["name"] for t in body["result"]["tools"]] == ["get_budget_summary"]


def test_budget_summary_returns_every_covering_budget(fake_api: list[str]) -> None:
    result = call_tool("get_budget_summary", {"on_date": "2026-10-27"})["structuredContent"]

    assert [b["name"] for b in result["budgets"]] == ["Week of Oct 26", "October 2026"]
    october = result["budgets"][1]
    assert october["income"] == {"planned": "5000.00", "actual": "2500.00", "remaining": "2500.00"}
    assert october["items"][0]["remaining"] == "-25.50"  # over budget
    assert "/me" not in fake_api  # a date was given, so no timezone lookup


def test_budget_summary_defaults_to_today_and_notes_gaps(fake_api: list[str]) -> None:
    result = call_tool("get_budget_summary", {"on_date": "2027-03-01"})["structuredContent"]
    assert result["budgets"] == []
    assert result["note"] == "No budget covers this date."
    assert len(result["recent_budgets"]) == 3

    fake_api.clear()
    call_tool("get_budget_summary", {})
    assert fake_api[:2] == ["/me", "/finance/budgets"]  # today comes from the user's timezone


def test_cognito_mode_requires_a_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DISCI_MCP_AUTH_MODE", "cognito")
    monkeypatch.setenv("DISCI_MCP_COGNITO_ISSUER", "https://cognito.example.test/pool")
    monkeypatch.setenv("DISCI_MCP_COGNITO_CLIENT_ID", "mcp-client")

    status, headers, _ = invoke(gateway_event("POST", "/mcp", rpc("tools/list")))
    assert status == 401
    meta_url = "https://mcp.example.test/.well-known/oauth-protected-resource/mcp"
    assert f'resource_metadata="{meta_url}"' in headers["www-authenticate"]

    status, _, meta = invoke(gateway_event("GET", "/.well-known/oauth-protected-resource/mcp"))
    assert status == 200
    assert meta["resource"] == "https://mcp.example.test/mcp"
    assert meta["authorization_servers"] == ["https://cognito.example.test/pool"]


def test_dev_auth_is_refused_in_prod(monkeypatch: pytest.MonkeyPatch) -> None:
    from pydantic import ValidationError

    from disci_mcp.settings import Settings

    monkeypatch.setenv("DISCI_MCP_ENV", "prod")
    with pytest.raises(ValidationError):
        Settings()  # type: ignore[call-arg]


def test_request_log_line(caplog: pytest.LogCaptureFixture) -> None:
    headers = {**MCP_HEADERS, "user-agent": "Claude-User"}
    with caplog.at_level("INFO", logger="disci_mcp.requests"):
        invoke(gateway_event("POST", "/mcp", rpc("tools/list"), headers=headers))
    lines = [r.getMessage() for r in caplog.records if r.name == "disci_mcp.requests"]
    assert lines == ["POST /mcp -> 200  rpc=tools/list  sub=-  ua=Claude-User"]
