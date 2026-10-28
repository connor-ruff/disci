# MCP Server

*Status: **live** since 2026-10-26, with 19 tools (9 finance, 8 nutrition, 2 tasks; §4.3). The server lives in `mcp_server/` and deploys with every push to `main`, alongside the API and web app ([deployment.md](../ops/deployment.md) §3). Infrastructure: [deployment.md](../ops/deployment.md) §2.2.*

The MCP server lets Claude (and other MCP clients, such as Instinct AI) read and change a user's Disci data. This doc covers how it authenticates with Cognito, how it's built and run, how to connect Claude, and the decisions behind it. What's not built yet is in [roadmap.md](../roadmap.md).

---

## 1. Auth with Cognito

Cognito is the OAuth provider. A throwaway connector test on 2026-10-25 showed that Claude's custom connector works with it (§2), and production has run this way since.

- **Client.** A separate Cognito app client, `disci-mcp` (`controlled_resources/disci/auth.tf` in `aws_iac_mngr`), with its secret in Secrets Manager (`disci-mcp-cognito-client-keys`). Claude's callback `https://claude.ai/api/mcp/auth_callback` is registered on it. Cognito has no dynamic client registration, so each user pastes the shared client ID and secret into Claude (§5) and then signs in on Cognito's hosted login **as themselves**, so the token carries their own `sub`. A shared secret is acceptable for a small invite-only group.
- **Discovery.** Claude accepts Cognito's OIDC discovery doc (`https://cognito-idp.us-east-2.amazonaws.com/us-east-2_fNVWgEaJ5/.well-known/openid-configuration`; the pool id isn't a secret), even though it has no `registration_endpoint` or `code_challenge_methods_supported`. The oauth-authorization-server path returns 400 and isn't needed. The server answers unauthenticated calls with **401** and `WWW-Authenticate: Bearer resource_metadata="<url>"`, and serves RFC 9728 protected-resource metadata at `/.well-known/oauth-protected-resource/mcp`: `resource` equal to the MCP URL exactly, the issuer as the first `authorization_servers` entry, and `scopes_supported` (Claude requests only what's advertised).
- **Tokens.** The access token has `sub`, `username` (= sub), `client_id`, `scope`, `token_use=access`, `iss`, `iat`, `exp` and `jti`, but **no `email` and no `aud`**. So everything keys on `sub`: the server checks `client_id`, API Gateway's authorizer matches `client_id` against its audience list (web + `disci-mcp`), and the API looks the user up with `core.find_user(sub)`. That lookup never creates a user, so a user must sign in to the web app once first, else **403**.
- **Refresh.** Silent. With a 5-minute access token Claude got a new one (new `jti`) with no 401 and no re-login. Users sign in once per connection and again only when the 30-day refresh token lapses or they remove the connector.
- **The mid-handshake 400.** Claude (`ua=Claude-User`) opens with a `server/discover` request, which mcp 1.30 doesn't know (its latest protocol version is 2025-11-25). The SDK fails to validate the message and answers HTTP 400 instead of a JSON-RPC "method not found" error. Claude then carries on normally. Instinct AI (`ua=python-requests`) does the standard `initialize` → `notifications/initialized` → `tools/call` and never sees it. Harmless; the fix is on the [roadmap](../roadmap.md).

---

## 2. Repeating the auth test

Worth doing after changing the Cognito client or upgrading the SDK. The 2026-10-25 test used a throwaway stub server. Its source was removed from this doc, and is in git history (`git show 93d89a6:docs/mcp/mcp-overview.md`, appendix). The real server in cognito mode (§4.1) should serve the same purpose, but hasn't been used for this yet.

1. Run the server locally on `127.0.0.1:8765` in cognito mode: `cd mcp_server && uv run uvicorn disci_mcp.server:create_app --factory --port 8765`, with the §4.1 variables set: `DISCI_MCP_AUTH_MODE=cognito`, `DISCI_MCP_PUBLIC_URL` = the tunnel URL (next step), the Cognito issuer and the `disci-mcp` client ID. `DISCI_MCP_API_URL` can point at a local `make api`, which ignores the token in dev auth and acts as the seeded user, which is fine for an auth test.
2. Expose it with `cloudflared tunnel --url http://127.0.0.1:8765` (a quick tunnel, no account). The URL changes each run. `PUBLIC_URL` must equal it, because the metadata's `resource` must match the URL entered in Claude exactly, including `/mcp`.
3. In Claude: Customize > Connectors > Add custom connector > URL `<tunnel>/mcp` > Advanced settings > "Use your own OAuth client" > client ID and secret (`tofu output mcp_client_id` and `tofu output -raw mcp_client_secret` in `aws_iac_mngr/controlled_resources/disci`, or the Secrets Manager secret).
4. To test refresh: temporarily set `access_token_validity = 5` (minutes; Cognito's minimum) on the `disci-mcp` client in `auth.tf`, apply, and reconnect the connector (existing tokens keep their old lifetime). Call a tool, wait more than 5 minutes, and call again. A new `jti` in the token shows the refresh worked. Then restore it to 60 and apply.
5. Afterwards, stop the tunnel and remove the test connector.

---

## 3. SDK and implementation notes

- Official Python MCP SDK. `mcp` 2.x renamed FastMCP to `MCPServer` and changed APIs, so `mcp_server/` pins `mcp>=1.30,<2` and imports `from mcp.server.fastmcp import FastMCP`.
- Auth pattern: `FastMCP(..., token_verifier=<obj with async verify_token(token) -> AccessToken | None>, auth=AuthSettings(issuer_url=<Cognito issuer>, resource_server_url=<PUBLIC_URL>/mcp, required_scopes=["openid"], validate_token_resource=False))`. The SDK then serves the `401` + `WWW-Authenticate: Bearer ... resource_metadata=...` and `/.well-known/oauth-protected-resource/mcp` automatically.
- `validate_token_resource=False` because Cognito access tokens have no `aud`.
- The verifier checks the signature via PyJWT `PyJWKClient` on the pool JWKS (RS256), `iss`, `token_use == "access"`, and `client_id` == the MCP client.
- DNS-rebinding protection is off (`TransportSecuritySettings(enable_dns_rebinding_protection=False)`). It broke the server behind a tunnel, and it isn't needed: the protection guards servers on localhost, and this one is public with bearer auth on every request.
- `stateless_http=True` (needed for Lambda / API Gateway).
- The app is a Starlette app from `mcp.streamable_http_app()`, served by uvicorn.
- `get_access_token()` from `mcp.server.auth.middleware.auth_context` exposes the caller's claims inside a tool.

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
│   ├── tasks.py           # tasks tools (register(mcp))
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

`create_app()` wraps the app in `RequestLog` (`request_log.py`, pure ASGI), so it runs locally and on Lambda. One INFO line per HTTP request on logger `disci_mcp.requests`, e.g. `POST /mcp -> 200  rpc=tools/call  sub=3f9a1c2e  ua=Claude-User`: method, path, status (`error` if the app raised before responding), JSON-RPC method(s) from the body (`-` if none, `response` for client responses, comma-joined for batches), first 8 chars of the verified token's Cognito `sub` (`-` if unauthenticated), user-agent (60 chars max). Never logs tokens or bodies. Purpose: tell MCP clients apart and catch odd status codes (like the 400 in §1).

### 4.3 Tools

Kind = the MCP annotation from `common.py`: **R** read (`readOnlyHint`; clients run it without asking), **W** write, **D** destructive (`destructiveHint`; clients confirm first). All finance endpoints are under `/finance`, nutrition under `/nutrition`, tasks under `/tasks` ([api-overview.md §7](../api/api-overview.md)).

| Tool | Kind | What it does | API endpoints |
|---|---|---|---|
| `get_budget_summary(on_date?)` | R | Every budget covering the date: income/expense `planned`, `actual`, `remaining`; per item `planned`, `actual` (confirmed only), `pending`, `remaining` (= planned − actual); `days_in_period` and `days_elapsed` (counting the date). No covering budget: a `note` plus up to 5 `recent_budgets`. | `GET /finance/budgets`, `GET /finance/budgets/{id}` |
| `log_transaction(amount, budget_item_ids?, payee?, description?, occurred_on?, kind?, notes?)` | W | Records an expense (default) or income. The whole amount counts toward each given item (at most one per budget). | `POST /finance/transactions`, then `GET /finance/transactions/{id}` |
| `list_budget_transactions(budget_id)` | R | A budget's transactions, newest first, with the item each counts toward. | `GET /finance/budgets/{id}/transactions` |
| `update_transaction(transaction_id, …)` | W | Changes only the fields passed. A new amount carries over allocations that held the full amount; partial ones keep theirs (capped). `budget_item_ids` replaces them (`[]` unassigns). | `GET` + `PUT /finance/transactions/{id}` |
| `delete_transaction(transaction_id)` | D | Deletes it; it stops counting everywhere. | `DELETE /finance/transactions/{id}` |
| `get_transaction_inbox()` | R | `needs_you`: open entries from recurring rules, each with `entry_id`, `kind` (`place`: pending, approve and say where it counts; `pick_item`: auto-applied but this budget had no matching item), `transaction`, `meant_for` (`{item, category}`, the rule's intent), and `budget` / `item` when set. `unassigned` (confirmed, in no budget). `applied`: the last 20 ledger entries (what rules applied on their own), each with `seen`. | `GET /finance/inbox` |
| `resolve_inbox_entries(decisions)` | W | Each decision `{entry_id, budget_item_ids, amount?}`. `place`: approves (optionally with a corrected amount) and counts it in full toward the items (at most one per budget; `[]` = approved but unassigned). `pick_item`: exactly one item in that entry's budget. Per-item outcomes, each with the transaction. | `POST /finance/inbox/{id}/resolve` each |
| `dismiss_inbox_entries(entry_ids)` | D | `place`: rejects the transaction (discarded; the rule won't generate that date again). `pick_item`: skips that budget. Per-item outcomes. | `POST /finance/inbox/{id}/dismiss` each |
| `get_monthly_checklist()` | R | The monthly budget's checklist by due day, each item `done` or not with its `done_when` (`full_amount` or `any_payment`, the item's checklist mode), with `done` / `left` counts. | `GET /finance/checklist` |
| `get_nutrition_settings()` | R | Tracked nutrients (with units), the others, and the goals in effect today. | `GET /nutrition/preferences`, `GET /nutrition/goals` |
| `search_foods(query?, limit?)` | R | The food repo ranked by how many query words match name + description (ranked in the MCP server); empty query lists by name. | `GET /nutrition/foods` |
| `add_food(name, standard_quantity, standard_unit, description?, <nutrients>?)` | W | Adds a food, e.g. from a label; nutrients left out are stored as null (unknown). | `POST /nutrition/foods` |
| `log_foods(entries, eaten_on?)` | W | Logs one entry per food. Each entry is either a repo food (`food_id` + `servings`, multiples of the standard quantity) or a **quick add** (`name` + `nutrients`, a dict of nutrient key → total for what was eaten; nothing saved to the repo). Per-item outcomes (a quick add's reports `quick_add: <name>` instead of `food_id`), then the day as in `get_food_day`. | `POST /nutrition/logs` or `POST /nutrition/quick-logs` each, then the `get_food_day` reads |
| `get_food_day(day?)` | R | The day's entries (with log ids; a quick add has `food_id: null` and `serving: null`), and per tracked nutrient the total next to its target/limit and any `missing_foods`. | `GET /nutrition/days/{date}`, `GET /nutrition/preferences`, `GET /nutrition/goals?on=` |
| `update_food_log(log_id, eaten_on, servings?, move_to?, notes?)` | W | Changes servings or notes, or moves the entry to another day; returns that day. A quick add can be moved or given notes (its name and nutrients are kept); passing `servings` for one is an error. | `GET /nutrition/days/{date}`, `PUT /nutrition/logs/{id}` (or `PUT /nutrition/quick-logs/{id}` for a quick add) |
| `delete_food_log(log_id)` | D | Deletes a log entry. | `DELETE /nutrition/logs/{id}` |
| `set_nutrition_goal(nutrient, kind, amount)` | W | Sets a daily `target` or `limit` from today, replacing the current one of that nutrient and kind; returns the `previous_amount`. | `GET /nutrition/goals`, then `POST /nutrition/goals` or `PUT /nutrition/goals/{id}` |
| `get_tasks()` | R | Every active task grouped by kind, each with only the fields its kind uses (today's count and target, interval and next due, due date, done / last done, `due_status` and `days_until_due`), plus each kind's explanation. | `GET /tasks/types`, `GET /tasks` |
| `log_task_completion(task_id, times?, on_date?)` | W | Checks a task off (on a past day if given). `times` (default 1) repeats the check-off, for partial progress on a daily checklist task (3 of 5); `times > 1` on any other kind is refused before anything is written. A failure part way reports how many were logged. Returns the task as it now stands. | `GET /tasks/{id}` (only when `times > 1`), then `POST /tasks/{id}/complete` × `times` |

**Conventions**

- **Task-shaped wrappers over existing endpoints.** Each tool answers one request an assistant gets ("I just spent $69.12 at Trader Joe's", "how's my budget this month?", "log 6 oz of yogurt and an apple", "limit calories to 1800"), combining API calls as needed. The API and database are unchanged. Docstrings tell Claude which tool to call first (e.g. `get_budget_summary` for item ids, `search_foods` before `log_foods` / `add_food`, `get_tasks` before `log_task_completion`).
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

The tests run against a routed `FakeApi` (`tests/conftest.py`), which returns canned answers by method and path and records each call and body.

| File | Covers |
|---|---|
| `test_server.py` | Repeated Lambda invocations on one warm handler (§4.4), the cognito-mode 401 and protected-resource metadata, dev auth refused in prod, the request log line. |
| `test_api.py` | How API errors become tool errors (§4.2). |
| `test_finance.py`, `test_nutrition.py`, `test_tasks.py` | Each module's tools: the API calls they make, merging updates with current values, per-item batch outcomes, and the shape of what they return. |

Run `make mcp-test` for the current count. New tools get a test in their module's file. Beyond the tests, every tool has been smoke-tested end to end against the local API (`make api` + `make mcp`).

---

## 5. Connecting Claude

Once applied and deployed:

1. Connector URL: the `mcp_url` deploy-config value (`<api endpoint>/mcp`), from SSM `/disci/prod/mcp_url` or the `deploy_config` output in `aws_iac_mngr/controlled_resources/disci`.
2. In Claude: Customize > Connectors > Add custom connector > that URL > Advanced settings > "Use your own OAuth client" > client ID and secret (`tofu output mcp_client_id` / `tofu output -raw mcp_client_secret`, or the Secrets Manager secret).
3. Sign in on the Cognito hosted page. The user must have **signed in to the Disci web app at least once** first, else tools answer "Sign in to the Disci web app once first".

Logs: `/aws/lambda/disci-mcp` (14 days). Request lines only: `aws logs tail /aws/lambda/disci-mcp --since 1h --filter-pattern '"->"'` (Lambda's default log format omits the logger name, so filter on the arrow).

---

## 6. Decisions

- **Hosting:** a separate Lambda with routes on the existing HTTP API, **outside the VPC** (`mcp.tf`). The VPC has no NAT, so a Lambda inside it couldn't call the public API URL. The `/mcp` and `/.well-known/*` routes have no authorizer, because the server does its own auth.
- **Data access: forward the caller's access token to the API.** The server never touches the database, so RLS, validation and business rules stay in one place. The authorizer's audience includes the `disci-mcp` client, and the API accepts access tokens whose `client_id` is `DISCI_MCP_CLIENT_ID`.
- **Users: identified by Cognito `sub`, with no change to the users table.** `core.users.cognito_sub` already existed. The lookup-only `core.find_user(sub)` ([db/shared.md](../db/shared.md)) maps a request to an existing user and never creates one.
- **Tool surface: task-shaped tools** (§4.3), designed from how the user talks to Claude: log a purchase, check the budget, handle the Inbox, the monthly checklist, add a food from a label, log a meal, change a goal, "what's due today?", "I did my jaw exercises". Tasks tools only read tasks and log completions. Creating, editing and undoing tasks stays in the web app.

**Limits to design within**

- About 150,000 characters max per tool result, and 240 s per tool call on claude.ai. API Gateway's HTTP API times out at 30 s with no response streaming (the Lambda times out at 25 s), which is fine for stateless tools.
- Claude's egress range is `160.79.104.0/21`, if allow-listing is ever needed.
- OAuth discovery and token endpoints must answer within 10 s.
- The 401 must be a real 401: Claude ignores `WWW-Authenticate` on a 200.
- Only the first `authorization_servers` entry is used.

Reference: <https://claude.com/docs/connectors/building/authentication.md> and <https://claude.com/docs/connectors/building/testing.md>
