from types import SimpleNamespace

import httpx
import pytest

from disci_mcp import lambda_handler
from tests.conftest import MCP_HEADERS, gateway_event, invoke, rpc


def test_handler_serves_repeated_invocations() -> None:
    """The session manager starts once per app; a warm Lambda must still serve call 2."""
    for _ in range(2):
        status, _, body = invoke(gateway_event("POST", "/mcp", rpc("tools/list")))
        assert status == 200
        names = {t["name"] for t in body["result"]["tools"]}
        assert {"get_budget_summary", "log_foods"} <= names


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
    (record,) = [r for r in caplog.records if r.name == "disci_mcp.requests"]
    assert record.getMessage() == "POST /mcp -> 200  rpc=tools/list  sub=-  ua=Claude-User"
    # On Lambda the JSON log format turns these into keys.
    assert (record.status, record.rpc, record.ua) == (200, "tools/list", "Claude-User")  # type: ignore[attr-defined]
    assert isinstance(record.duration_ms, int)  # type: ignore[attr-defined]


def test_tools_send_the_lambda_request_id_to_the_api(monkeypatch: pytest.MonkeyPatch) -> None:
    """So a tool call can be followed from the MCP's log into the API's."""
    from disci_mcp import api

    sent: list[str | None] = []

    def answer(request: httpx.Request) -> httpx.Response:
        sent.append(request.headers.get("X-Request-Id"))
        return httpx.Response(200, json=[])

    real = httpx.AsyncClient
    transport = httpx.MockTransport(answer)
    monkeypatch.setattr(api.httpx, "AsyncClient", lambda **kw: real(transport=transport, **kw))

    event = gateway_event("POST", "/mcp", rpc("tools/call", {"name": "get_tasks", "arguments": {}}))
    resp = lambda_handler.handler(event, SimpleNamespace(aws_request_id="lambda-req-1"))
    assert resp["statusCode"] == 200
    assert sent == ["lambda-req-1", "lambda-req-1"]
