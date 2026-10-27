# MCP Server

*Status (as of 2026-10-26): **live and verified end to end; 17 finance and nutrition tools built.** The server lives in `mcp_server/` (§4). The first deploy (PR #2) shipped one read-only tool, `get_budget_summary`; the server now has 17 tools (9 finance, 8 nutrition, §4.3), smoke-tested end to end against the local API and not yet deployed. Its infrastructure (`aws_iac_mngr`, `controlled_resources/disci/mcp.tf`: the `disci-mcp` Lambda and its routes, plus authorizer/API changes) is applied and the code deployed (PR #2). On 2026-10-26 the custom connector logged in through Cognito, listed the tools and called `get_budget_summary` against production data. Cognito is kept as the auth provider: a throwaway test on 2026-10-25 proved Claude's custom connector can authenticate against Cognito with a pre-registered client, per-user identity works, and silent token refresh works. Already live: the `disci-mcp` Cognito client (`controlled_resources/disci/auth.tf`) and its Secrets Manager secret `disci-mcp-cognito-client-keys` (`controlled_resources/general/secrets_manager`). The auth detail (client, discovery, tokens) lives in [deployment.md §9](../ops/deployment.md#9-known-follow-ups) and is not repeated here.*

This doc exists so a fresh session can pick up the MCP server without re-deriving anything: what the auth test proved, how to repeat it, SDK notes, how the server is built and run, how to connect Claude to it, what is decided and what is still open, and the historical stub source (appendix).

---

## 1. What the test showed

Details of the client, discovery and tokens are in [deployment.md §9](../ops/deployment.md#9-known-follow-ups).

- Login via the Cognito hosted page works with "Use your own OAuth client" and the client ID + secret.
- Claude accepted Cognito's OIDC discovery doc despite no `registration_endpoint` and no `code_challenge_methods_supported`.
- Claude lists tools, resources and prompts right after connecting (UA `Claude-User`; requests were also seen from `python-httpx`).
- The access token has `sub` but no `email` and no `aud`.
- With a 5-minute access token, Claude refreshed silently (new `jti`, no 401, no re-login).
- One request returned HTTP 400 mid-handshake (followed by successful retries). Explained on 2026-10-26: see (g) in §6.

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
│   ├── api.py             # request() + get/post/put/delete: calls the Disci API as the caller, maps errors to ToolError; today()
│   ├── common.py          # READ/WRITE/DESTRUCTIVE tool annotations, each() (per-item batch outcomes), num()
│   ├── finance.py         # finance tools (register(mcp))
│   ├── nutrition.py       # nutrition tools (register(mcp))
│   ├── request_log.py     # RequestLog: ASGI middleware, one log line per HTTP request (§4.2)
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

API errors become tool errors: **403** → "Sign in to the Disci web app once first, then try again." (the API has no user row for that `sub`; access tokens carry no email, so only a web sign-in creates the row); other 4xx/5xx → `Disci API error <status>: <message>`, where the message is FastAPI's `detail` (validation errors joined as `body.amount: must be > 0`) or else the start of the body. HTTP timeout 10 s.

`server.py`: `stateless_http=True` (Lambda), `json_response=True` (plain JSON, not SSE), DNS-rebinding protection off (§3), and server `instructions` telling Claude that amounts are dollar strings, dates are `YYYY-MM-DD` in the user's timezone, and that before changing anything it should tell the user what it's about to write (e.g. which budget item a purchase counts toward) unless they already said so.

`create_app()` wraps the app in `RequestLog` (`request_log.py`, pure ASGI), so it runs locally and on Lambda. One INFO line per HTTP request on logger `disci_mcp.requests`, e.g. `POST /mcp -> 200  rpc=tools/call  sub=3f9a1c2e  ua=Claude-User`: method, path, status (`error` if the app raised before responding), JSON-RPC method(s) from the body (`-` if none, `response` for client responses, comma-joined for batches), first 8 chars of the verified token's Cognito `sub` (`-` if unauthenticated), user-agent (60 chars max). Never logs tokens or bodies. Purpose: tell MCP clients apart and catch odd status codes (§6 (g)).

### 4.3 Tools

Kind = the MCP annotation from `common.py`: **R** read (`readOnlyHint`; clients run it without asking), **W** write, **D** destructive (`destructiveHint`; clients confirm first). All finance endpoints are under `/finance`, nutrition under `/nutrition` ([api-overview.md §7](../api/api-overview.md)).

| Tool | Kind | What it does | API endpoints |
|---|---|---|---|
| `get_budget_summary(on_date?)` | R | Every budget covering the date: income/expense `planned`, `actual`, `remaining`; per item `planned`, `actual` (confirmed only), `pending`, `remaining` (= planned − actual); `days_in_period` and `days_elapsed` (counting the date). No covering budget: a `note` plus up to 5 `recent_budgets`. | `GET /finance/budgets`, `GET /finance/budgets/{id}` |
| `log_transaction(amount, budget_item_ids?, payee?, description?, occurred_on?, kind?, notes?)` | W | Records an expense (default) or income. The whole amount counts toward each given item (at most one per budget). | `POST /finance/transactions`, then `GET /finance/transactions/{id}` |
| `list_budget_transactions(budget_id)` | R | A budget's transactions, newest first, with the item each counts toward. | `GET /finance/budgets/{id}/transactions` |
| `update_transaction(transaction_id, …)` | W | Changes only the fields passed. A new amount carries over allocations that held the full amount; partial ones keep theirs (capped). `budget_item_ids` replaces them (`[]` unassigns). | `GET` + `PUT /finance/transactions/{id}` |
| `delete_transaction(transaction_id)` | D | Deletes it; it stops counting everywhere. | `DELETE /finance/transactions/{id}` |
| `get_transaction_inbox()` | R | `pending` (from recurring rules, awaiting approval) and `unassigned` (confirmed, in no budget). | `GET /finance/inbox` |
| `approve_transactions(approvals)` | W | Approves pending transactions, each optionally with a corrected amount. Per-item outcomes. | `POST /finance/transactions/{id}/approve` each |
| `reject_transactions(transaction_ids)` | D | Discards pending transactions; the rule won't generate that date again. Per-item outcomes. | `POST /finance/transactions/{id}/reject` each |
| `get_monthly_checklist()` | R | The monthly budget's checklist by due day, each item `done` or not, with `done` / `left` counts. | `GET /finance/checklist` |
| `get_nutrition_settings()` | R | Tracked nutrients (with units), the others, and the goals in effect today. | `GET /nutrition/preferences`, `GET /nutrition/goals` |
| `search_foods(query?, limit?)` | R | The food repo ranked by how many query words match name + description (ranked in the MCP server); empty query lists by name. | `GET /nutrition/foods` |
| `add_food(name, standard_quantity, standard_unit, description?, <nutrients>?)` | W | Adds a food, e.g. from a label; nutrients left out are stored as null (unknown). | `POST /nutrition/foods` |
| `log_foods(entries, eaten_on?)` | W | Logs one entry per food (servings = multiples of the standard quantity). Per-item outcomes, then the day as in `get_food_day`. | `POST /nutrition/logs` each, then the `get_food_day` reads |
| `get_food_day(day?)` | R | The day's entries (with log ids), and per tracked nutrient the total next to its target/limit and any `missing_foods`. | `GET /nutrition/days/{date}`, `GET /nutrition/preferences`, `GET /nutrition/goals?on=` |
| `update_food_log(log_id, eaten_on, servings?, move_to?, notes?)` | W | Changes servings or notes, or moves the entry to another day; returns that day. | `GET /nutrition/days/{date}`, `PUT /nutrition/logs/{id}` |
| `delete_food_log(log_id)` | D | Deletes a log entry. | `DELETE /nutrition/logs/{id}` |
| `set_nutrition_goal(nutrient, kind, amount)` | W | Sets a daily `target` or `limit` from today, replacing the current one of that nutrient and kind; returns the `previous_amount`. | `GET /nutrition/goals`, then `POST /nutrition/goals` or `PUT /nutrition/goals/{id}` |

**Conventions**

- **Task-shaped wrappers over existing endpoints.** Each tool answers one request an assistant gets ("I just spent $69.12 at Trader Joe's", "how's my budget this month?", "log 6 oz of yogurt and an apple", "limit calories to 1800"), combining API calls as needed. The API and database are unchanged. Docstrings tell Claude which tool to call first (e.g. `get_budget_summary` for item ids, `search_foods` before `log_foods` / `add_food`).
- **Dates default to today in the user's timezone** (`api.today()`, from `GET /me`).
- **Batches report per-item outcomes** (`common.each()`): every call is its own API transaction, so one failure comes back as `{"id", "ok": false, "error"}` instead of failing the rest.
- **Unknown nutrient values are omitted, not shown as 0** (food `nutrients` leave out null keys; day totals list `missing_foods`). Decimals are trimmed of trailing zeros (`common.num()`: `"170.000000"` → `"170"`).
- **Update tools merge with current values**, because the API's `PUT`s take full bodies: `update_transaction` and `update_food_log` read the record first and send it back with only the passed fields changed.

Add a tool in the module's `<module>.py` inside `register(mcp)` (a new module's `register` is called from `build_mcp`), with a `READ` / `WRITE` / `DESTRUCTIVE` annotation.

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

**21 tests**, against a routed `FakeApi` (`tests/conftest.py`: canned answers by method and path, recording each call and body). `test_server.py` (4): repeated Lambda invocations on one warm handler; cognito mode answering 401 with `WWW-Authenticate` `resource_metadata` and serving the protected-resource metadata; dev auth refused in prod; the request log line. `test_api.py` (4): error messages carrying FastAPI's `detail` (string and validation list) and the 403 sign-in message; an empty body → `None`. `test_finance.py` (7): budget summary for every covering budget, defaulting to today and noting gaps; `log_transaction` counting the full amount toward each item; `update_transaction` keeping what isn't passed; approve reporting each outcome; reject and delete; inbox and checklist. `test_nutrition.py` (6): settings; search ranking; `add_food` sending unknowns as null; `log_foods` per-entry outcomes and the day; `update_food_log` keeping what isn't passed; `set_nutrition_goal` updating or creating. Beyond the tests, every tool was smoke-tested end to end against the local API (`make api` + `make mcp`).

---

## 5. Connecting Claude

Once applied and deployed:

1. Connector URL: the `mcp_url` deploy-config value (`<api endpoint>/mcp`), from SSM `/disci/prod/mcp_url` or the `deploy_config` output in `aws_iac_mngr/controlled_resources/disci`.
2. In Claude: Customize > Connectors > Add custom connector > that URL > Advanced settings > "Use your own OAuth client" > client ID and secret (`tofu output mcp_client_id` / `tofu output -raw mcp_client_secret`, or the Secrets Manager secret).
3. Sign in on the Cognito hosted page. The user must have **signed in to the Disci web app at least once** first, else tools answer "Sign in to the Disci web app once first".

Logs: `/aws/lambda/disci-mcp` (14 days). Request lines only: `aws logs tail /aws/lambda/disci-mcp --since 1h --filter-pattern '"->"'` (Lambda's default log format omits the logger name, so filter on the arrow).

---

## 6. Build checklist

**Decided**

- Separate MCP Lambda with routes on the existing HTTP API, outside the VPC (`mcp.tf`).
- Unauthenticated `/.well-known/*` routes (the MCP server does its own auth).
- Claude's callback `https://claude.ai/api/mcp/auth_callback` is already on the `disci-mcp` client.
- Identify users by Cognito `sub`.
- (a) **Data access: forward the access token to the API.** The authorizer's audience now includes the `disci-mcp` client (API Gateway matches `client_id` for access tokens), and the API accepts access tokens whose `client_id` equals `DISCI_MCP_CLIENT_ID`.
- (b) **Schema: resolved without a migration of the users table.** `core.users` already had `cognito_sub` (unique). A new lookup-only function `core.find_user(sub)` ([db/shared.md](../db/shared.md)) maps an MCP request to an existing user; it never creates one. The user must sign in to the web app once first (that creates the row via `core.ensure_user`); otherwise **403**.
- (c) **Tool surface: 17 task-shaped tools** for finance and nutrition (§4.3), designed from how the user plans to talk to Claude (log a purchase, check the budget, approve recurring transactions, the monthly checklist, add a food from a label, log a meal, change a goal). No tasks tools yet.

**Open**

- (d) **Disci settings page** showing each user the MCP URL, client ID and shared secret. The secret is shared across invited users, which is acceptable now; Anthropic-held credentials (directory listing) or a DCR provider would remove the paste step later.
- (e) **CloudWatch alarms / alerting.** None exist yet, including for `disci-jobs` and `disci-mcp` failures.
- (f) **API Gateway limits.** 30 s HTTP API timeout and no streaming (fine for stateless tools; the Lambda times out at 25 s).
- (g) **The mid-handshake 400: explained, harmless, not yet fixed.** The request log (§4.2) showed it on 2026-10-26: Claude (`ua=Claude-User`) opens with a `server/discover` request, which mcp 1.30 doesn't know (its latest protocol version is 2025-11-25). The SDK fails to validate the message and answers HTTP 400 instead of a JSON-RPC "method not found" error. Claude then carries on (`notifications/initialized`, `tools/call`, both fine). Other clients don't send it: Instinct AI (`ua=python-requests`) does the standard `initialize` → `notifications/initialized` → `tools/call`. Likely fix: move to mcp 2.x (breaking API changes, so its own change), which may support `server/discover`.
- (h) **Deploy the 17-tool server** and verify it from Claude against production data.

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
