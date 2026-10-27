import json
import os
from typing import Any

# Must be set before disci_mcp reads its settings.
os.environ.update(
    DISCI_MCP_ENV="test",
    DISCI_MCP_AUTH_MODE="dev",
    DISCI_MCP_PUBLIC_URL="https://mcp.example.test",
    DISCI_MCP_API_URL="http://api.example.test",
)

import pytest  # noqa: E402

from disci_mcp import lambda_handler, settings  # noqa: E402

MCP_HEADERS = {
    "content-type": "application/json",
    "accept": "application/json, text/event-stream",
    "host": "mcp.example.test",
}


@pytest.fixture(autouse=True)
def fresh_settings() -> None:
    settings.get_settings.cache_clear()


def gateway_event(method: str, path: str, body: Any = None, headers: dict | None = None) -> dict:
    """An API Gateway HTTP API (payload v2) event, as the disci-mcp Lambda receives it."""
    return {
        "version": "2.0",
        "routeKey": f"{method} {path}",
        "rawPath": path,
        "rawQueryString": "",
        "headers": headers if headers is not None else MCP_HEADERS,
        "requestContext": {
            "http": {"method": method, "path": path, "sourceIp": "160.79.104.1"},
            "domainName": "mcp.example.test",
        },
        "body": json.dumps(body) if body is not None else None,
        "isBase64Encoded": False,
    }


def invoke(event: dict) -> tuple[int, dict, Any]:
    resp = lambda_handler.handler(event, None)
    body = json.loads(resp["body"]) if resp.get("body") else None
    return resp["statusCode"], resp.get("headers", {}), body


def rpc(method: str, params: dict | None = None) -> dict:
    return {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}


class FakeApi:
    """Stands in for the Disci API: canned answers by (method, path), recording calls.

    An answer may be a callable taking the request body; raising ToolError in it plays
    an API error.
    """

    def __init__(self) -> None:
        self.routes: dict[tuple[str, str], Any] = {("GET", "/me"): {"timezone": "UTC"}}
        self.calls: list[tuple[str, str, Any]] = []

    async def request(self, method: str, path: str, params: Any = None, body: Any = None) -> Any:
        self.calls.append((method, path, body))
        answer = self.routes[(method, path)]
        return answer(body) if callable(answer) else answer

    def sent(self, method: str, path: str) -> list[Any]:
        """Bodies sent to one route, in order."""
        return [b for m, p, b in self.calls if (m, p) == (method, path)]


@pytest.fixture
def fake_api(monkeypatch: pytest.MonkeyPatch) -> FakeApi:
    from disci_mcp import api

    fake = FakeApi()
    monkeypatch.setattr(api, "request", fake.request)
    return fake


def call_tool(name: str, arguments: dict) -> Any:
    """Calls a tool over MCP; returns its structured result, or raises with its error text."""
    status, _, body = invoke(
        gateway_event("POST", "/mcp", rpc("tools/call", {"name": name, "arguments": arguments}))
    )
    assert status == 200
    result = body["result"]
    if result.get("isError"):
        raise AssertionError(result["content"][0]["text"])
    return result["structuredContent"]
