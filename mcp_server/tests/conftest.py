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
