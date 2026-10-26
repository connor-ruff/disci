from typing import Any

import httpx
from mcp.server.fastmcp.exceptions import ToolError

from disci_mcp.auth import caller_token
from disci_mcp.settings import get_settings

# API Gateway gives up at 30 s; stay well inside it and Claude's own limits.
TIMEOUT = httpx.Timeout(10.0)


async def get(path: str, params: dict[str, Any] | None = None) -> Any:
    """GET a Disci API path as the calling user and return the JSON body.

    The API does all the work (RLS, validation); this server never touches the database.
    In cognito mode the caller's access token is forwarded as is, and API Gateway
    verifies it again. In dev mode the configured dev user is sent as X-Dev-User.
    """
    settings = get_settings()
    if settings.auth_mode == "dev":
        headers = {"X-Dev-User": settings.dev_user}
    else:
        token = caller_token()
        if token is None:
            raise ToolError("Not authenticated")
        headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(base_url=settings.api_url, timeout=TIMEOUT) as client:
        resp = await client.get(path, params=params, headers=headers)
    if resp.status_code == 403:
        raise ToolError("Sign in to the Disci web app once first, then try again.")
    if resp.status_code == 404:
        raise ToolError("Not found.")
    if resp.status_code >= 400:
        raise ToolError(f"Disci API error {resp.status_code}: {resp.text[:300]}")
    return resp.json()
