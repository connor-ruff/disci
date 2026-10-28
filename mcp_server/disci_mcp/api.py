from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from mcp.server.fastmcp.exceptions import ToolError

from disci_mcp.auth import caller_token
from disci_mcp.request_log import request_id
from disci_mcp.settings import get_settings

# API Gateway gives up at 30 s; stay well inside it and Claude's own limits.
TIMEOUT = httpx.Timeout(10.0)


async def request(
    method: str, path: str, params: dict[str, Any] | None = None, body: Any = None
) -> Any:
    """Call a Disci API path as the calling user and return the JSON body (None if empty).

    The API does all the work (RLS, validation); this server never touches the database.
    In cognito mode the caller's access token is forwarded as is, and API Gateway
    verifies it again. In dev mode the configured dev user is sent as X-Dev-User.
    On Lambda, this invocation's request ID goes along as X-Request-Id for the API's log.
    """
    settings = get_settings()
    if settings.auth_mode == "dev":
        headers = {"X-Dev-User": settings.dev_user}
    else:
        token = caller_token()
        if token is None:
            raise ToolError("Not authenticated")
        headers = {"Authorization": f"Bearer {token}"}
    if rid := request_id.get():
        headers["X-Request-Id"] = rid

    async with httpx.AsyncClient(base_url=settings.api_url, timeout=TIMEOUT) as client:
        resp = await client.request(method, path, params=params, json=body, headers=headers)
    if resp.status_code == 403:
        raise ToolError("Sign in to the Disci web app once first, then try again.")
    if resp.status_code >= 400:
        raise ToolError(f"Disci API error {resp.status_code}: {_detail(resp)}")
    return resp.json() if resp.content else None


def _detail(resp: httpx.Response) -> str:
    """The API's error message: FastAPI's `detail`, or the raw text."""
    try:
        detail = resp.json()["detail"]
    except (ValueError, KeyError, TypeError):
        return resp.text[:300]
    if isinstance(detail, list):  # validation errors
        return "; ".join(f"{'.'.join(map(str, e.get('loc', [])))}: {e.get('msg')}" for e in detail)
    return str(detail)


async def get(path: str, params: dict[str, Any] | None = None) -> Any:
    return await request("GET", path, params=params)


async def post(path: str, body: Any = None) -> Any:
    return await request("POST", path, body=body)


async def put(path: str, body: Any) -> Any:
    return await request("PUT", path, body=body)


async def delete(path: str) -> None:
    await request("DELETE", path)


async def today() -> date:
    """Today in the user's timezone."""
    me = await get("/me")
    return datetime.now(ZoneInfo(me["timezone"])).date()
