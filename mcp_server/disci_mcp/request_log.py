import json
import logging

from starlette.types import ASGIApp, Message, Receive, Scope, Send

log = logging.getLogger("disci_mcp.requests")


class RequestLog:
    """Logs one line per HTTP request: method, path, status, JSON-RPC method, the caller's
    Cognito sub (first 8 characters) and user-agent. Never logs tokens or bodies.

    Pure ASGI rather than BaseHTTPMiddleware, so it can peek at the request body (for the
    JSON-RPC method) and still hand it on to the app untouched.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        body = bytearray()
        status = 0

        async def receive_and_keep() -> Message:
            message = await receive()
            if message["type"] == "http.request":
                body.extend(message.get("body", b""))
            return message

        async def send_and_note(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive_and_keep, send_and_note)
        finally:
            # The auth middleware inside the app sets scope["user"] on this same dict.
            token = getattr(scope.get("user"), "access_token", None)
            sub = token.subject[:8] if token and token.subject else "-"
            headers = dict(scope.get("headers") or [])
            ua = headers.get(b"user-agent", b"-").decode(errors="replace")[:60]
            rpc = _rpc_method(bytes(body))
            log.info(
                "%s %s -> %s  rpc=%s  sub=%s  ua=%s",
                scope["method"], scope["path"], status or "error", rpc, sub, ua,
            )  # fmt: skip


def _rpc_method(body: bytes) -> str:
    """The JSON-RPC method(s) in a request body, or "-"."""
    try:
        msg = json.loads(body)
    except ValueError:
        return "-"
    msgs = msg if isinstance(msg, list) else [msg]
    methods = [m.get("method") or "response" for m in msgs if isinstance(m, dict)]
    return ",".join(methods) or "-"
