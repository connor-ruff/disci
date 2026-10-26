# MCP Server

*Status (as of 2026-10-26): **proof of concept built, awaiting `tofu apply` and deploy.** The server lives in `mcp_server/` (§4) with one read-only tool, `get_budget_summary`. The infrastructure (`aws_iac_mngr`, `controlled_resources/disci/mcp.tf`: the `disci-mcp` Lambda and its routes, plus authorizer/API changes) is planned (10 add, 4 change, 0 destroy) but **not applied**, and the code is **not deployed**. Cognito is kept as the auth provider: a throwaway test on 2026-10-25 proved Claude's custom connector can authenticate against Cognito with a pre-registered client, per-user identity works, and silent token refresh works. Already live: the `disci-mcp` Cognito client (`controlled_resources/disci/auth.tf`) and its Secrets Manager secret `disci-mcp-cognito-client-keys` (`controlled_resources/general/secrets_manager`). The auth detail (client, discovery, tokens) lives in [deployment.md §9](../ops/deployment.md#9-known-follow-ups) and is not repeated here.*

This doc exists so a fresh session can pick up the MCP server without re-deriving anything: what the auth test proved, how to repeat it, SDK notes, how the server is built and run, how to connect Claude to it, what is decided and what is still open, and the historical stub source (appendix).

---

## 1. What the test showed

Details of the client, discovery and tokens are in [deployment.md §9](../ops/deployment.md#9-known-follow-ups).

- Login via the Cognito hosted page works with "Use your own OAuth client" and the client ID + secret.
- Claude accepted Cognito's OIDC discovery doc despite no `registration_endpoint` and no `code_challenge_methods_supported`.
- Claude lists tools, resources and prompts right after connecting (UA `Claude-User`; requests were also seen from `python-httpx`).
- The access token has `sub` but no `email` and no `aud`.
- With a 5-minute access token, Claude refreshed silently (new `jti`, no 401, no re-login).
- One request returned HTTP 400 mid-handshake (followed by successful retries) and was never explained. Treat as unknown; check once the real server is deployed.

---

## 2. How the test was run (to repeat it)

1. Run the throwaway stub (source in the appendix) locally on `127.0.0.1:8765`. Env: `PUBLIC_URL`, `COGNITO_CLIENT_ID`.
2. Expose it with `cloudflared tunnel --url http://127.0.0.1:8765` (quick tunnel, no account). The URL changes each run, and `PUBLIC_URL` must equal the tunnel URL: the protected-resource metadata `resource` must match the URL the user enters in Claude exactly, including `/mcp`.
3. In Claude: Customize > Connectors > Add custom connector > URL `<tunnel>/mcp` > Advanced settings > "Use your own OAuth client" > client ID and secret. Get them from `tofu output mcp_client_id` and `tofu output -raw mcp_client_secret` in `aws_iac_mngr/controlled_resources/disci`, or from the Secrets Manager secret.
4. The server log (token `iat`/`exp`/`jti` per request) is how to confirm refresh.
5. To test refresh: temporarily set `access_token_validity = 5` (minutes; Cognito's minimum) on the `disci-mcp` client in `auth.tf`, apply, reconnect the connector (existing tokens keep their old lifetime), call a tool, wait more than 5 minutes, call again. Then restore to 60 and apply.
6. Afterwards, stop the tunnel and remove the test connector.

---

## 3. SDK and implementation notes (from the stub; the real server follows them)

- Official Python MCP SDK. `mcp` 2.x renamed FastMCP to `MCPServer` and changed APIs, so the stub pinned `mcp>=1.12,<2` (1.30.0 was used; `mcp_server/` pins `mcp>=1.30,<2`) and imports `from mcp.server.fastmcp import FastMCP`.
- Auth pattern: `FastMCP(..., token_verifier=<obj with async verify_token(token) -> AccessToken | None>, auth=AuthSettings(issuer_url=<Cognito issuer>, resource_server_url=<PUBLIC_URL>/mcp, required_scopes=["openid"], validate_token_resource=False))`. The SDK then serves the `401` + `WWW-Authenticate: Bearer ... resource_metadata=...` and `/.well-known/oauth-protected-resource/mcp` automatically.
- `validate_token_resource=False` because Cognito access tokens have no `aud`.
- The verifier checks the signature via PyJWT `PyJWKClient` on the pool JWKS (RS256), `iss`, `token_use == "access"`, and `client_id` == the MCP client.
- DNS-rebinding protection had to be disabled (`TransportSecuritySettings(enable_dns_rebinding_protection=False)`) behind the tunnel. The real server keeps it off: the protection guards servers on localhost, and this one is public with bearer auth on every request.
- `stateless_http=True` (needed for Lambda / API Gateway).
- The app is a Starlette app from `mcp.streamable_http_app()`, served by uvicorn.
- `get_access_token()` from `mcp.server.auth.middleware.auth_context` exposes the caller's claims inside a tool.
- Cognito discovery is the OIDC doc only (`.../.well-known/openid-configuration`); the oauth-authorization-server path returns 400.
- Issuer: `https://cognito-idp.us-east-2.amazonaws.com/us-east-2_fNVWgEaJ5` (the pool id is not a secret).

---

## 4. The server (`mcp_server/`)

Python 3.13, managed with **uv**. Deps: `mcp>=1.30,<2` (FastMCP), `pyjwt[crypto]`, `httpx`, `mangum`, `pydantic-settings`; dev: `pytest`, `ruff`, `uvicorn`. It **never touches the database**: every tool calls the Disci API over HTTP as the calling user, so RLS, validation and business rules stay in the API.

```
mcp_server/
├── pyproject.toml / uv.lock
├── disci_mcp/
│   ├── settings.py        # Settings from DISCI_MCP_* env vars (below)
│   ├── auth.py            # CognitoVerifier (token_verifier for FastMCP), caller_token()
│   ├── api.py             # get(path): calls the Disci API as the caller, maps errors to ToolError
│   ├── finance.py         # finance tools (register(mcp))
│   ├── server.py          # build_mcp(settings), create_app() (a fresh Starlette app)
│   └── lambda_handler.py  # Lambda entry point `handler` (disci-mcp)
└── tests/                 # pytest; no database or API needed (the API is faked)
```

### 4.1 Settings

Read from `DISCI_MCP_*` environment variables (`settings.py`). Like the API, `ENV`, `AUTH_MODE` and the URLs have **no defaults**, so a misconfigured deploy fails at startup.

| Variable | Values | Default | Notes |
|---|---|---|---|
| `DISCI_MCP_ENV` | `local`, `test`, `prod` | none | |
| `DISCI_MCP_AUTH_MODE` | `dev`, `cognito` | none | `dev` is **refused when `DISCI_MCP_ENV=prod`**. |
| `DISCI_MCP_PUBLIC_URL` | URL, no trailing slash | none | Base URL clients reach the server at. The MCP endpoint is `<public_url>/mcp`, and the protected-resource metadata names it exactly. |
| `DISCI_MCP_API_URL` | URL, no trailing slash | none | The Disci API the tools call. |
| `DISCI_MCP_COGNITO_ISSUER` | URL | none | cognito mode: the user pool issuer. Required in cognito mode. |
| `DISCI_MCP_COGNITO_CLIENT_ID` | string | none | cognito mode: the `disci-mcp` app client. Required in cognito mode. |
| `DISCI_MCP_DEV_USER` | string | `local-dev-user` | dev mode: the user the API acts as (sent as `X-Dev-User`). |

### 4.2 Auth and data access

| Mode | Behavior |
|---|---|
| `cognito` | FastMCP gets `token_verifier=CognitoVerifier(...)` and `AuthSettings` (as in §3). The verifier checks the signature (pool JWKS, RS256, keys cached per warm Lambda), expiry, `iss`, `token_use == "access"` and `client_id` == the `disci-mcp` client. Unauthenticated requests get **401** with `WWW-Authenticate: Bearer ... resource_metadata=...`, and `/.well-known/oauth-protected-resource/mcp` is served. Tools **forward the caller's access token** to the API as `Authorization: Bearer`; API Gateway verifies it again and the API looks the user up by `sub` ([api-overview.md §3–4](../api/api-overview.md)). |
| `dev` | No OAuth. Tools send `X-Dev-User: <DISCI_MCP_DEV_USER>` to a local API running dev auth. |

API errors become tool errors: **403** → "Sign in to the Disci web app once first, then try again." (the API has no user row for that `sub`; access tokens carry no email, so only a web sign-in creates the row), 404 → "Not found.", other 4xx/5xx → the status and the start of the body. HTTP timeout 10 s.

`server.py`: `stateless_http=True` (Lambda), `json_response=True` (plain JSON, not SSE), DNS-rebinding protection off (§3), and server `instructions` telling Claude that amounts are dollar strings and dates are `YYYY-MM-DD` in the user's timezone.

### 4.3 Tools

| Tool | Module | What it does |
|---|---|---|
| `get_budget_summary(on_date?)` | `finance.py` | Read-only (`readOnlyHint`). Every budget covering `on_date` (default: today in the user's timezone, from `GET /me`), from `GET /finance/budgets` and `GET /finance/budgets/{id}`: `income` / `expense` totals with `planned`, `actual`, `remaining`, and each item's `planned`, `actual` (confirmed only), `pending` and `remaining` (= planned − actual). When no budget covers the date: a `note` plus up to 5 `recent_budgets` (name, period type, start, end). |

Add a tool as a thin wrapper over existing API endpoints, in a `<module>.py` with `register(mcp)`, called from `build_mcp`.

### 4.4 Lambda (and the lifespan gotcha)

`lambda_handler.handler` builds **a new Mangum app per invocation**: `Mangum(create_app(), lifespan="on")(event, context)`. Mangum runs the ASGI lifespan on **every** invocation, and the lifespan starts FastMCP's `StreamableHTTPSessionManager.run()`, which can only be called **once per instance**. Reusing one app across invocations crashes on the second request of a warm Lambda (verified; `test_handler_serves_repeated_invocations` guards it). Building the app is cheap (no I/O), and the JWKS client is cached at module level, so it survives.

Built by `scripts/build-mcp-zip.sh` → `build/mcp.zip` (Linux arm64 wheels, no Docker, same approach as the API zip), shipped by `scripts/deploy.sh` after the API and jobs. Smoke-tested in the `public.ecr.aws/lambda/python:3.13-arm64` image. Infrastructure: [deployment.md](../ops/deployment.md) §2.2.

### 4.5 Run, test, lint

| Command | What it does |
|---|---|
| `make mcp-install` | `uv sync` in `mcp_server/`. |
| `make mcp` | Serves http://localhost:8001/mcp (uvicorn, `--factory`, auto-reload) with **dev auth**, calling the API at http://localhost:8000. Needs `make api` running. Point an MCP client (e.g. MCP Inspector) at it. |
| `make mcp-test` | `pytest`. No database or API needed. |
| `make mcp-lint` | `ruff check` and `ruff format --check`. |

CI (`.github/workflows/deploy.yml`, `test` job) runs `mcp-lint` and `mcp-test` alongside the API's.

**5 tests** (`tests/test_server.py`): repeated Lambda invocations on one warm handler; `get_budget_summary` returning every covering budget with totals and remaining; defaulting / noting gaps when no budget covers the date; cognito mode answering 401 with `WWW-Authenticate` `resource_metadata` and serving the protected-resource metadata; dev auth refused in prod.

---

## 5. Connecting Claude

Once applied and deployed:

1. Connector URL: the `mcp_url` deploy-config value (`<api endpoint>/mcp`), from SSM `/disci/prod/mcp_url` or the `deploy_config` output in `aws_iac_mngr/controlled_resources/disci`.
2. In Claude: Customize > Connectors > Add custom connector > that URL > Advanced settings > "Use your own OAuth client" > client ID and secret (`tofu output mcp_client_id` / `tofu output -raw mcp_client_secret`, or the Secrets Manager secret).
3. Sign in on the Cognito hosted page. The user must have **signed in to the Disci web app at least once** first, else tools answer "Sign in to the Disci web app once first".

Logs: `/aws/lambda/disci-mcp` (14 days).

---

## 6. Build checklist

**Decided**

- Separate MCP Lambda with routes on the existing HTTP API, outside the VPC (`mcp.tf`; built, not applied).
- Unauthenticated `/.well-known/*` routes (the MCP server does its own auth).
- Claude's callback `https://claude.ai/api/mcp/auth_callback` is already on the `disci-mcp` client.
- Identify users by Cognito `sub`.
- (a) **Data access: forward the access token to the API.** The authorizer's audience now includes the `disci-mcp` client (API Gateway matches `client_id` for access tokens), and the API accepts access tokens whose `client_id` equals `DISCI_MCP_CLIENT_ID`.
- (b) **Schema: resolved without a migration of the users table.** `core.users` already had `cognito_sub` (unique). A new lookup-only function `core.find_user(sub)` ([db/shared.md](../db/shared.md)) maps an MCP request to an existing user; it never creates one. The user must sign in to the web app once first (that creates the row via `core.ensure_user`); otherwise **403**.
- (c) **Tool surface: first tool is `get_budget_summary`** (read-only, §4.3). Next: food logging and expense entry, as thin wrappers over existing endpoints.

**Open**

- (d) **Disci settings page** showing each user the MCP URL, client ID and shared secret. The secret is shared across invited users, which is acceptable now; Anthropic-held credentials (directory listing) or a DCR provider would remove the paste step later.
- (e) **CloudWatch alarms / alerting.** None exist yet, including for `disci-jobs` and `disci-mcp` failures.
- (f) **API Gateway limits.** 30 s HTTP API timeout and no streaming (fine for stateless tools; the Lambda times out at 25 s).
- (g) **Verify end to end** after apply + deploy: connect from Claude, call `get_budget_summary`, watch for the unexplained mid-handshake 400 (§1).

**Limits to design within**

- About 150,000 chars max tool result and 240 s per tool call on claude.ai.
- Claude's egress range is `160.79.104.0/21`.
- OAuth discovery and token endpoints must answer within 10 s.
- The 401 must be a real 401 (Claude ignores `WWW-Authenticate` on a 200).
- Only the first `authorization_servers` entry is used.

Reference: <https://claude.com/docs/connectors/building/authentication.md> and <https://claude.com/docs/connectors/building/testing.md>

---

## Appendix: stub server source (historical)

Throwaway reference from the 2026-10-25 auth test, kept for repeating that test (§2). **Superseded by `mcp_server/`; not production code.** Dependencies (installed with uv): `mcp>=1.12,<2`, `pyjwt[crypto]`, `httpx`, `uvicorn`.

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
