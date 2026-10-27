import pytest

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
    lines = [r.getMessage() for r in caplog.records if r.name == "disci_mcp.requests"]
    assert lines == ["POST /mcp -> 200  rpc=tools/list  sub=-  ua=Claude-User"]
