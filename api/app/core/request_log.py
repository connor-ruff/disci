import logging
import time
from collections.abc import Awaitable, Callable

from fastapi import Request, Response

from app.core.auth import gateway_jwt_claims

# Sent by the MCP server: its own Lambda request ID, so a tool call can be followed into
# the API's logs.
CALLER_REQUEST_ID_HEADER = "X-Request-Id"

log = logging.getLogger("app.requests")


async def log_request(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Logs one line per request. On Lambda (JSON log format) the `extra` fields become
    keys next to Lambda's own `requestId`. Never logs tokens, query strings or bodies.
    """
    start = time.perf_counter()
    status = 500  # if the app raises, the client gets a 500
    try:
        response = await call_next(request)
        status = response.status_code
        return response
    finally:
        duration_ms = round((time.perf_counter() - start) * 1000)
        sub = (gateway_jwt_claims(request) or {}).get("sub")
        log.info(
            "%s %s -> %s (%d ms)",
            request.method, request.url.path, status, duration_ms,
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": status,
                "duration_ms": duration_ms,
                "sub": sub[:8] if sub else None,
                "caller_request_id": request.headers.get(CALLER_REQUEST_ID_HEADER),
            },
        )  # fmt: skip
