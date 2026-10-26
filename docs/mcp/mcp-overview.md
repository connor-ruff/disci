# MCP Server

*Status (as of 2026-10-26): **path forward confirmed, server not built.** Cognito is kept as the auth provider. A throwaway test on 2026-10-25 proved Claude's custom connector can authenticate against Cognito with a pre-registered client, per-user identity works, and silent token refresh works. Nothing MCP-related is deployed yet except the `disci-mcp` Cognito client (`aws_iac_mngr` repo, `controlled_resources/disci/auth.tf`) and its Secrets Manager secret `disci-mcp-cognito-client-keys` (`aws_iac_mngr`, `controlled_resources/general/secrets_manager`; created empty, then filled). The auth detail (client, discovery, tokens) lives in [deployment.md §9](../ops/deployment.md#9-known-follow-ups) and is not repeated here.*

This doc exists so a fresh session can pick up the MCP server build without re-deriving anything: what the test proved, how to repeat it, SDK notes, what is decided and what is still open, and the stub source (appendix).

---

## 1. What the test showed

Details of the client, discovery and tokens are in [deployment.md §9](../ops/deployment.md#9-known-follow-ups).

- Login via the Cognito hosted page works with "Use your own OAuth client" and the client ID + secret.
- Claude accepted Cognito's OIDC discovery doc despite no `registration_endpoint` and no `code_challenge_methods_supported`.
- Claude lists tools, resources and prompts right after connecting (UA `Claude-User`; requests were also seen from `python-httpx`).
- The access token has `sub` but no `email` and no `aud`.
- With a 5-minute access token, Claude refreshed silently (new `jti`, no 401, no re-login).
- One request returned HTTP 400 mid-handshake (followed by successful retries) and was never explained. Treat as unknown; check when the real server is built.

---

## 2. How the test was run (to repeat it)

1. Run the throwaway stub (source in the appendix) locally on `127.0.0.1:8765`. Env: `PUBLIC_URL`, `COGNITO_CLIENT_ID`.
2. Expose it with `cloudflared tunnel --url http://127.0.0.1:8765` (quick tunnel, no account). The URL changes each run, and `PUBLIC_URL` must equal the tunnel URL: the protected-resource metadata `resource` must match the URL the user enters in Claude exactly, including `/mcp`.
3. In Claude: Customize > Connectors > Add custom connector > URL `<tunnel>/mcp` > Advanced settings > "Use your own OAuth client" > client ID and secret. Get them from `tofu output mcp_client_id` and `tofu output -raw mcp_client_secret` in `aws_iac_mngr/controlled_resources/disci`, or from the Secrets Manager secret.
4. The server log (token `iat`/`exp`/`jti` per request) is how to confirm refresh.
5. To test refresh: temporarily set `access_token_validity = 5` (minutes; Cognito's minimum) on the `disci-mcp` client in `auth.tf`, apply, reconnect the connector (existing tokens keep their old lifetime), call a tool, wait more than 5 minutes, call again. Then restore to 60 and apply.
6. Afterwards, stop the tunnel and remove the test connector.

---

## 3. SDK and implementation notes (from the stub)

- Official Python MCP SDK. `mcp` 2.x renamed FastMCP to `MCPServer` and changed APIs, so the stub pinned `mcp>=1.12,<2` (1.30.0 was used) and imports `from mcp.server.fastmcp import FastMCP`.
- Auth pattern: `FastMCP(..., token_verifier=<obj with async verify_token(token) -> AccessToken | None>, auth=AuthSettings(issuer_url=<Cognito issuer>, resource_server_url=<PUBLIC_URL>/mcp, required_scopes=["openid"], validate_token_resource=False))`. The SDK then serves the `401` + `WWW-Authenticate: Bearer ... resource_metadata=...` and `/.well-known/oauth-protected-resource/mcp` automatically.
- `validate_token_resource=False` because Cognito access tokens have no `aud`.
- The verifier checks the signature via PyJWT `PyJWKClient` on the pool JWKS (RS256), `iss`, `token_use == "access"`, and `client_id` == the MCP client.
- DNS-rebinding protection had to be disabled (`TransportSecuritySettings(enable_dns_rebinding_protection=False)`) behind the tunnel. Revisit for the Lambda hostname.
- `stateless_http=True` (needed for Lambda / API Gateway).
- The app is a Starlette app from `mcp.streamable_http_app()`, served by uvicorn.
- `get_access_token()` from `mcp.server.auth.middleware.auth_context` exposes the caller's claims inside a tool.
- Cognito discovery is the OIDC doc only (`.../.well-known/openid-configuration`); the oauth-authorization-server path returns 400.
- Issuer: `https://cognito-idp.us-east-2.amazonaws.com/us-east-2_fNVWgEaJ5` (the pool id is not a secret).

---

## 4. Build checklist

**Decided**

- Separate MCP Lambda with a route on the existing HTTP API, outside the VPC.
- Unauthenticated `/.well-known/*` routes.
- Claude's callback `https://claude.ai/api/mcp/auth_callback` is already on the `disci-mcp` client.
- Identify users by Cognito `sub`.

**Open**

- (a) **How the MCP Lambda reaches data.** Either forward the user's access token to the API (then the API/authorizer must accept access tokens: API Gateway JWT authorizers match `client_id` for access tokens, and the app currently requires `token_use == "id"` and an `email` claim), or the MCP Lambda validates the token itself and calls the API another way.
- (b) **Schema.** Add a Cognito `sub` column to the users table (db migration; document in [db/shared.md](../db/shared.md)) and decide how existing users, matched today by email via the ID token, get their `sub` linked, e.g. on first web login.
- (c) **Tool surface.** Start with food logging and expense entry, as thin wrappers over existing endpoints.
- (d) **Disci settings page** showing each user the MCP URL, client ID and shared secret. The secret is shared across invited users, which is acceptable now; Anthropic-held credentials (directory listing) or a DCR provider would remove the paste step later.
- (e) **CloudWatch alarms / alerting.** None exist yet, including for `disci-jobs` failures.
- (f) **API Gateway limits.** 30 s HTTP API timeout and no streaming (fine for stateless tools).

**Limits to design within**

- About 150,000 chars max tool result and 240 s per tool call on claude.ai.
- Claude's egress range is `160.79.104.0/21`.
- OAuth discovery and token endpoints must answer within 10 s.
- The 401 must be a real 401 (Claude ignores `WWW-Authenticate` on a 200).
- Only the first `authorization_servers` entry is used.

Reference: <https://claude.com/docs/connectors/building/authentication.md> and <https://claude.com/docs/connectors/building/testing.md>

---

## Appendix: stub server source

Throwaway reference from the 2026-10-25 test, **not production code**. Dependencies (installed with uv): `mcp>=1.12,<2`, `pyjwt[crypto]`, `httpx`, `uvicorn`.

```python
"""Throwaway MCP server to test Claude's custom connector against Cognito OAuth.

Env: PUBLIC_URL (tunnel base, no trailing slash), COGNITO_CLIENT_ID (the test client).
"""
import logging
import os
import time

import jwt
import uvicorn
from jwt import PyJWKClient
from mcp.server.auth.provider import AccessToken
from mcp.server.auth.settings import AuthSettings
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from starlette.middleware.base import BaseHTTPMiddleware

POOL_ID = "us-east-2_fNVWgEaJ5"
ISSUER = f"https://cognito-idp.us-east-2.amazonaws.com/{POOL_ID}"
PUBLIC_URL = os.environ["PUBLIC_URL"].rstrip("/")
CLIENT_ID = os.environ["COGNITO_CLIENT_ID"]

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("stub")
jwks = PyJWKClient(f"{ISSUER}/.well-known/jwks.json")


class CognitoVerifier:
    async def verify_token(self, token: str) -> AccessToken | None:
        try:
            key = jwks.get_signing_key_from_jwt(token).key
            claims = jwt.decode(token, key, algorithms=["RS256"], issuer=ISSUER, options={"verify_aud": False})
        except Exception as e:
            log.info("token rejected: %s", e)
            return None
        if claims.get("token_use") != "access" or claims.get("client_id") != CLIENT_ID:
            log.info("token rejected: token_use=%s client_id=%s", claims.get("token_use"), claims.get("client_id"))
            return None
        log.info("token ok: sub=%s iat=%s exp=%s (life %ss) jti=%s", claims["sub"][:8], time.strftime("%H:%M:%S", time.localtime(claims["iat"])), time.strftime("%H:%M:%S", time.localtime(claims["exp"])), claims["exp"] - claims["iat"], claims.get("jti", "")[:8])
        return AccessToken(
            token=token,
            client_id=claims["client_id"],
            scopes=claims.get("scope", "").split(),
            expires_at=claims.get("exp"),
            subject=claims["sub"],
            claims=claims,
        )


mcp = FastMCP(
    "disci-stub",
    token_verifier=CognitoVerifier(),
    auth=AuthSettings(
        issuer_url=ISSUER,
        resource_server_url=f"{PUBLIC_URL}/mcp",
        required_scopes=["openid"],
        validate_token_resource=False,  # Cognito access tokens carry no aud
    ),
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    stateless_http=True,
)


@mcp.tool()
def ping() -> str:
    """Return 'pong' and the server time."""
    return f"pong {time.strftime('%Y-%m-%d %H:%M:%S')}"


@mcp.tool()
def whoami() -> dict:
    """Return the identity claims from the caller's Cognito access token."""
    from mcp.server.auth.middleware.auth_context import get_access_token

    t = get_access_token()
    return {"sub": t.subject, "scopes": t.scopes, "username": (t.claims or {}).get("username")}


class LogRequests(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        resp = await call_next(request)
        log.info("%s %s -> %s (auth header: %s, UA: %s)", request.method, request.url.path, resp.status_code,
                 "yes" if request.headers.get("authorization") else "no", request.headers.get("user-agent", "")[:40])
        return resp


app = mcp.streamable_http_app()
app.add_middleware(LogRequests)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="warning")
```
