# API Overview

*Status: **skeleton implemented and deployed** to AWS Lambda behind API Gateway (https://molrqp0ch5.execute-api.us-east-2.amazonaws.com). Core endpoints (`/me`, `/me/modules`) work, and so do the **finance module** (categories, budgets, budget items, transactions, reordering, recurring transactions with approvals, the inbox and the monthly checklist) and the **nutrition module** (tracked nutrients, the food repo, the daily food log and history, and macro goals). The first scheduled job (hourly recurring-transaction generation, `app/jobs/recurring.py`) runs as the `disci-jobs` Lambda. Cognito auth works in production. Deploying and operating it: [deployment.md](../ops/deployment.md).*

The API is the only thing that talks to the database. The web app and the MCP server go through it over HTTP; scheduled jobs (`app/jobs/`) are part of the same codebase and zip, run in their own Lambda, and use the same database role, queries and row-level security (see §9 and [disci-infrastructure.md](../project_plans/disci-infrastructure.md)). It is **FastAPI** on Python 3.13, with plain SQL through **psycopg 3** (no ORM), managed with **uv**.

---

## 1. Layout

```
api/
├── pyproject.toml / uv.lock       # deps: fastapi, mangum, psycopg[binary], psycopg-pool, pydantic-settings
│                                  # dev: uvicorn, pytest, httpx, ruff, boto3 (the Lambda runtime provides boto3)
├── app/
│   ├── main.py                    # builds the app: CORS, /health, core routers, mounts each module at /<key>
│   ├── lambda_handler.py          # Lambda entry point `handler` (Mangum wraps the app)
│   ├── migrator.py                # migrator Lambda entry point (roles + dbmate; see §9)
│   ├── jobs/                      # scheduled jobs, one file per job (see §9.1)
│   │   └── recurring.py           # hourly: create due recurring transactions (handler + `python -m`)
│   ├── core/                      # cross-module plumbing
│   │   ├── settings.py            # Settings from DISCI_* env vars
│   │   ├── auth.py                # request → Identity (sub, email; email None for MCP access tokens)
│   │   ├── db.py                  # connection pool, per-request transaction (DbDep), sub → user
│   │   ├── rds_iam.py             # IamAuthConnection: logs in with an RDS IAM token
│   │   ├── sql.py                 # Queries: loads queries/<name>.sql
│   │   ├── module.py              # Module dataclass (what a module registers)
│   │   ├── queries/               # ensure_user.sql, find_user.sql, set_user.sql
│   │   ├── users/                 # GET/PUT /me (router, schemas, queries/)
│   │   └── user_modules/          # GET /me/modules, PUT/DELETE /me/modules/{key}
│   └── modules/
│       ├── __init__.py            # MODULES registry
│       └── finance/               # mounted at /finance
│           ├── __init__.py        # `module` + `setup` (seeds default expense categories on first enable)
│           ├── routes/            # thin HTTP routes, one file per area (see below)
│           │   ├── __init__.py    # `router`: composes the area routers
│           │   ├── _common.py     # shared helpers: not_found, invalid, constraint_errors, user_prefs, today_in
│           │   ├── categories.py  # categories + category order
│           │   ├── budgets.py     # budgets, items, item order
│           │   ├── transactions.py# create/get/edit/delete, approve/reject, allocations, inbox, budget transactions
│           │   ├── recurring.py   # recurring rules
│           │   └── checklist.py   # monthly checklist
│           ├── schemas.py         # Pydantic models (Money = Decimal, 2 places)
│           ├── service.py         # period bounds, default budget names, allocation validation, totals
│           ├── recurring.py       # Schedule, occurrences, next_occurrence, generate_for_user
│           ├── sql.py             # `queries = Queries(__file__)`, shared by routes, services and jobs
│           └── queries/           # one .sql per query
│       └── nutrition/             # mounted at /nutrition
│           ├── __init__.py        # `module` + `setup` (writes the default tracked nutrients on first enable)
│           ├── routes/
│           │   ├── __init__.py    # `router`: composes the area routers
│           │   ├── _common.py     # not_found, unique_errors (unique violation → 409), today_for (user's timezone)
│           │   ├── preferences.py # tracked nutrients
│           │   ├── foods.py       # the food repo
│           │   ├── logs.py        # days (sheet + history) and log entries
│           │   └── goals.py       # macro goals (effective-dated)
│           ├── schemas.py         # Pydantic models (NutrientKey, nutrient amounts as Decimal, 2 places)
│           ├── service.py         # NUTRIENTS registry, DEFAULT_TRACKED, entry_nutrients, day_totals
│           ├── sql.py             # `queries = Queries(__file__)`
│           └── queries/           # one .sql per query
└── tests/                         # pytest, against the disci_test database
    ├── conftest.py
    ├── core/                      # test_users.py, test_user_modules.py, test_aws.py
    ├── modules/finance/           # test_finance.py, test_recurring.py
    └── modules/nutrition/         # test_nutrition.py
```

A small module has `router.py` (thin HTTP routes), `schemas.py` (Pydantic models), `service.py` (business rules that don't belong in SQL) and `queries/` (one `.sql` per query); `core/users/` is a minimal example (no service).

**When a module outgrows one router file**, follow `finance/`:
- `routes/` becomes a package: one file per area, each with its own `router = APIRouter()` (optionally with a `prefix`), and `routes/__init__.py` builds the module's `router` by `include_router`-ing them. The module's `__init__.py` imports `router` from `routes`, so registration (§6) doesn't change.
- Helpers shared by several route files go in `routes/_common.py`.
- SQL is loaded once in `<module>/sql.py` (`queries = Queries(__file__)`, pointing at `<module>/queries/`), and routes, services and jobs all import `queries` from there.
- Domain logic that isn't HTTP-specific and is reused (e.g. by a job) gets its own file (`finance/recurring.py`), taking a `Connection` rather than a request.
- Scheduled jobs live in `app/jobs/` (one file per job, with a Lambda `handler` and a `python -m` entry point) and call into the module's code.

---

## 2. Settings

Read from environment variables with the `DISCI_` prefix (`core/settings.py`).

| Variable | Values | Default | Notes |
|---|---|---|---|
| `DISCI_ENV` | `local`, `test`, `prod` | none | |
| `DISCI_DATABASE_URL` | Postgres URL | none | Locally: `postgresql://disci_api:disci_api@localhost:5432/disci` |
| `DISCI_AUTH_MODE` | `dev`, `cognito` | none | `dev` is **refused when `DISCI_ENV=prod`** (startup fails). |
| `DISCI_CORS_ORIGINS` | JSON list | `["http://localhost:5173"]` | The Vite dev server. In production, the CloudFront origin. |
| `DISCI_DB_IAM_AUTH` | `true`, `false` | `false` | `true` makes the pool use `IamAuthConnection`: no password in the URL, each new connection signs an RDS IAM auth token (§4). Production only. |
| `DISCI_MCP_CLIENT_ID` | Cognito app client id | unset | The `disci-mcp` client. In cognito mode, access tokens issued to it (forwarded by the MCP server) are accepted (§3). Unset: only web ID tokens are. |

The first three have **no defaults on purpose**: a misconfigured deploy fails at startup instead of quietly running with local values. `make api` and the tests set them for you. In production, all of them are Lambda environment variables set by OpenTofu (`compute.tf` in the IaC repo), not read from SSM: the Lambda has no internet access.

---

## 3. Auth

| Mode | Who the request acts as |
|---|---|
| `dev` | `local-dev-user` (the user seeded by `db/seeds/dev.sql`), or whatever `sub` is in the **`X-Dev-User`** header. Email becomes `<sub>@disci.local`. Lets you test as several users locally. |
| `cognito` | The user from a verified Cognito token. The API does **not** verify the JWT itself: API Gateway's JWT authorizer already checked signature, expiry, issuer and audience (`aud` for ID tokens, `client_id` for access tokens; the audience list is the web and `disci-mcp` clients) before invoking the Lambda. The API reads the verified claims from the raw Lambda event, which Mangum exposes as `request.scope["aws.event"]` (`requestContext.authorizer.jwt.claims`), and accepts either an **ID token** (`token_use == "id"` with an `email` claim; the web app) or an **access token** (`token_use == "access"` with `client_id == DISCI_MCP_CLIENT_ID`; the MCP server forwarding Claude's token), which yields an identity with no email. Anything else (no claims, no `sub`, another client's access token, `DISCI_MCP_CLIENT_ID` unset) → **401**. The `X-Dev-User` header is ignored. |

Auth produces an `Identity(sub, email)` (`email` is `None` for MCP access tokens); it never touches the database itself.

The claims can't be forged because the Lambda can only be invoked by API Gateway, and every `disci-api` route except `GET /health` goes through the authorizer (the MCP server's own routes, `/mcp` and `/.well-known/*`, go to the `disci-mcp` Lambda instead). Cognito access tokens carry no `email`, so an MCP request can only act as a user that **already exists** (looked up by `sub`, §4); only a web sign-in creates the user. See [mcp-overview.md](../mcp/mcp-overview.md).

---

## 4. Request flow

Endpoints that need the database take `db: DbDep` (`core/db.py`). For each request it:

1. Takes a connection from the pool and opens **one transaction**.
2. Maps the identity to a user: with an email (web), `core.ensure_user(sub, email)`, creating the `core.users` row on first sign-in; without one (MCP), `core.find_user(sub)`, which only looks the user up, and no user → **403** "Sign in to the Disci web app once first".
3. Runs `set_config('app.user_id', <id>, true)` (same as `SET LOCAL`, but takes a bound parameter), so row-level security exposes only that user's rows.
4. Hands the endpoint `Db(conn, user_id)`.
5. **Commits** if the endpoint returns, **rolls back** if it raises.

The dependency uses `Depends(get_db, scope="function")`, so the commit happens **before** the response is sent: a client never sees success for a write that failed to commit.

**Database role.** The API connects as a login role that is a member of `disci_app` and does not own any tables, so RLS applies. Locally that is `disci_api` with a password (created by `db/local/roles.sql`). In production it is `disci_api` with **no password** and the `rds_iam` role (created by `db/aws/roles.sql`); with `DISCI_DB_IAM_AUTH=true` the pool uses `IamAuthConnection` (`core/rds_iam.py`), which signs a fresh IAM token (valid 15 minutes) for each **new** connection, locally with the Lambda's role and no network call. Open connections stay valid. Never connect the API as the owner `disci`, which bypasses RLS.

**Pool on Lambda.** The pool (`min_size=1`, `max_size=5`) is opened in the FastAPI lifespan, which Mangum runs on cold start (`lifespan="auto"`). Because Lambda freezes the process between invocations, the pool checks each connection is alive before handing it out.

---

## 5. SQL conventions

- Every SQL statement lives in a `queries/<name>.sql` file inside the package that uses it.
- Load by name: `queries = Queries(__file__)`, then `conn.execute(queries["get_user"], params)`. A module with several files that need its SQL defines `queries` once in `<module>/sql.py` and imports it.
- Values are **always bound parameters** (`%(name)s`). Never build SQL with f-strings, `.format()` or `+`; ruff's `S608` rule flags it.
- Dynamic identifiers (e.g. a sort column) go through `psycopg.sql.Identifier` and an allow-list.
- Rows come back as dicts (`dict_row`), ready for `Model.model_validate(row)`.

---

## 6. Adding a module

1. Create `app/modules/<key>/` where `<key>` matches the Postgres schema, the web folder and `core.user_modules.module_key`.
2. In its `__init__.py`, expose:
   ```python
   module = Module(key="finance", name="Finance", description="...", router=router, setup=None)
   ```
3. Add it to the tuple in `app/modules/__init__.py` (`MODULES`).

The router is mounted at `/<key>` automatically. `setup(conn, user_id)`, if given, runs **once**, in the same transaction, the first time a user enables the module (e.g. seeding default categories). It never runs on re-enable. The module also needs a migration that creates its schema and its grants (see [db-overview.md](../db/db-overview.md)) and its key must be allowed by the `module_key` CHECK on `core.user_modules` (finance, tasks and nutrition already are).

---

## 7. Endpoints

Interactive docs: http://localhost:8000/docs while `make api` is running.

| Method | Path | What it does |
|---|---|---|
| GET | `/health` | `{"status": "ok"}`. No auth, no database. In production this is the only route API Gateway leaves open. |
| GET | `/me` | The current user (`id`, `email`, `display_name`, `timezone`, `week_starts_on`). Creates the user on first call (web sign-ins only; an MCP request with no user yet → 403). |
| PUT | `/me` | Replace the user's settings: `display_name` (≤100 chars, nullable), `timezone` (IANA name), `week_starts_on` (1–7). Invalid values → 422. |
| GET | `/me/modules` | Every registered module (`key`, `name`, `description`, `enabled`). |
| PUT | `/me/modules/{key}` | Enable a module. Idempotent. First enable runs the module's `setup`. Unknown key → 404. |
| DELETE | `/me/modules/{key}` | Disable a module. Its data is kept and comes back on re-enable. Unknown key → 404. |
| * | `/finance/...` | Finance module, see §7.1. |
| * | `/nutrition/...` | Nutrition module, see §7.2. |

### 7.1 Finance (`/finance`)

Data model: [finance.md](../db/finance.md). **Money** is a `Decimal` with two places, serialized as a **string** (e.g. `"283.55"`); send it as a string or number.

| Method | Path | What it does |
|---|---|---|
| GET | `/finance/categories` | The user's categories (both kinds, each with `description`), ordered by kind, `sort_order`, name. |
| POST | `/finance/categories` | Create `{kind, name, description?}` (description ≤300 chars). It goes last in its kind's order. Duplicate name within a kind (case-insensitive) → **409**. |
| PUT | `/finance/categories/order` | Reorder one kind: `{kind, ids}`, the category ids in the desired order (each gets its position as `sort_order`). The order is per user and applies to every budget. Returns the full category list. |
| PUT | `/finance/categories/{id}` | Replace `{name, description}`. Duplicate → 409. |
| DELETE | `/finance/categories/{id}` | Soft-delete; its items become Uncategorized. 204. |
| GET | `/finance/budgets` | Budget list (`BudgetOut`), newest period first. |
| POST | `/finance/budgets` | Create `{period_type, period_date, name?}`. `period_date` is **any date in the period**; the API snaps it to the period start (weeks use the user's `week_starts_on`) and sets `period_end`. `name` defaults to "October 2026", "2026" or "Week of Oct 19, 2026". Optional `copy_from_budget_id` starts it from another budget's items (kind, category, name, planned amount, sort order, notes, checklist flag and day; items in a deleted category come across Uncategorized). Transactions and allocations are not copied. The source must be the user's own budget with the same `period_type`, else **422**. |
| GET | `/finance/budgets/{id}` | `BudgetDetail`: the budget, its `items` and `income` / `expense` totals (`{planned, actual}`). Each item has `planned_amount`, net `actual_amount` over **confirmed** transactions (same-kind allocated transactions add, opposite-kind subtract), `pending_amount` (the same over transactions awaiting approval), `is_checklist_item`, `checklist_day`, `checklist_done` (checklist items only: `actual_amount > 0` and `≥ planned_amount`; see the checklist row below) and `sort_order`. Items are ordered by kind, category order (Uncategorized last), then item order. |
| PUT | `/finance/budgets/{id}` | Replace `{name, notes}`. The period can't change. |
| DELETE | `/finance/budgets/{id}` | Soft-delete the budget and its items; their allocations are dropped (the transactions become unassigned). 204. |
| POST | `/finance/budgets/{id}/items` | Add `{kind, name, category_id?, planned_amount, is_checklist_item?, checklist_day?}`. It goes last in the budget's order. Returns the updated **`BudgetDetail`** (totals change too). |
| PUT | `/finance/budgets/{id}/items/order` | Reorder the budget's items: `{ids}` in the desired order. Returns `BudgetDetail`. |
| PUT | `/finance/items/{id}` | Replace `{name, category_id, planned_amount, is_checklist_item, checklist_day}` (kind can't change). Returns `BudgetDetail`. |
| DELETE | `/finance/items/{id}` | Soft-delete; its allocations are dropped. Returns `BudgetDetail`. |
| POST | `/finance/transactions` | Log `{kind, amount, occurred_on, payee?, description?, notes?, allocations: [{budget_item_id, amount}]}`. Always `confirmed`. An empty `allocations` list leaves it unassigned. Each item may appear once. `TransactionOut` includes `notes`, `status` and `recurring_transaction_id`. |
| GET | `/finance/transactions/{id}` | `TransactionDetail`: the `TransactionOut` fields plus `allocations`, every budget item it counts toward: `budget_item_id`, `budget_item_name`, `budget_item_kind`, `budget_id`, `budget_name`, `amount` (only items and budgets that aren't deleted). Not found or another user's → 404. |
| PUT | `/finance/transactions/{id}` | Edit a transaction. Body `TransactionUpdate`: the same fields as create, sent in full. `allocations` **replace** the existing ones (same validation as on create). Status and the recurring rule it came from don't change. Returns `TransactionDetail`. Not found or another user's → 404. |
| PUT | `/finance/transactions/{id}/allocations` | Replace the transaction's allocations with `{allocations: [...]}` (same validation as on create). Used to assign from the inbox. |
| POST | `/finance/transactions/{id}/approve` | Confirm a **pending** transaction, with an optional corrected `{amount}`; its allocations follow the new amount. Not pending (or not found) → 404. |
| POST | `/finance/transactions/{id}/reject` | Discard a **pending** transaction (soft delete). Its rule never generates that date again. 204. |
| GET | `/finance/budgets/{id}/transactions` | The budget's transactions, **one row per allocation** (`allocated_amount`, `budget_item_id`, `budget_item_name`), newest first. Includes pending ones (`status`). |
| DELETE | `/finance/transactions/{id}` | Soft-delete; its allocations are dropped. 204. |
| GET | `/finance/inbox` | `{pending, unassigned}`: transactions awaiting approval (oldest first), and confirmed transactions not counted toward any budget item (newest first). Each row adds `recurring_name` when it came from a rule. |
| GET | `/finance/recurring` | The user's recurring rules (`RecurringOut`: the rule's fields, `paused`, `category_name` and `next_occurrence`, the first date on or after today in the user's timezone, or null). |
| POST | `/finance/recurring` | Create a rule: `{kind, name, category_id?, amount, payee?, notes?, frequency, day_of_week?, day_of_month?, starts_on, ends_on?, auto_apply, requires_approval, paused}`. Weekly needs `day_of_week` (1–7, Mon–Sun) and monthly `day_of_month` (1–28), and only they; quarterly needs a `starts_on` day ≤ 28; `ends_on ≥ starts_on`; otherwise 422. Anything due today is generated **immediately**. 201. |
| PUT | `/finance/recurring/{id}` | Replace a rule (same body). Applies to future occurrences; transactions already created are unchanged. Generates anything now due. |
| DELETE | `/finance/recurring/{id}` | Soft-delete; nothing more is generated, its transactions stay. 204. |
| GET | `/finance/checklist` | Checklist items in the **monthly** budget(s) covering today (user's timezone), by due day: `budget_id`, `budget_name`, `item_id`, `item_name`, `kind`, `checklist_day`, `planned_amount`, `due_on`, `actual_amount` (net over **confirmed** allocated transactions; same kind adds, opposite kind subtracts, pending ones don't count), `done` (strict: `actual_amount > 0` and `≥ planned_amount`, so a $0-planned item needs something logged and a refund can un-tick an item) and `last_payment_on` (latest confirmed transaction date, or null). There is no per-transaction checklist flag: a payment, including one from a recurring rule, completes an item by bringing its actual up to plan. |

**Errors:**
- **404**: the budget, item, category, rule or transaction doesn't exist, is deleted, or belongs to another user (RLS hides it, so it's indistinguishable from missing). Approve/reject of a transaction that isn't pending is also 404.
- **409**: unique violation (duplicate category name within a kind).
- **422**: request validation (Pydantic), plus: an item or rule whose category doesn't exist or is of the other kind (the composite FK rejects it); a transaction allocated to an unknown or another user's item; a `copy_from_budget_id` that isn't the user's budget or has a different period type; allocations **within one budget** summing to more than the transaction's `amount` (across different budgets the same dollars may count again); a checklist item in a budget that isn't monthly, or `is_checklist_item` without a `checklist_day` (or vice versa); a recurring schedule that doesn't match its frequency.

Constraint violations are caught inside a savepoint (`constraint_errors` in `routes/_common.py`), so the request's transaction stays usable and the client gets a 4xx instead of a 500.

### 7.2 Nutrition (`/nutrition`)

Data model: [nutrition.md](../db/nutrition.md). **Nutrient amounts**, quantities and servings are `Decimal`s with up to **6 decimal places** (up to 16 digits; more places → 422), serialized as **strings** with all six places (e.g. `"34.000000"`). An entry's nutrients are the food's value × servings rounded to 6 places, and totals sum those. Goal `amount`s keep two places. A nutrient is one of eleven keys (`calories`, `protein_g`, `total_fat_g`, `saturated_fat_g`, `trans_fat_g`, `cholesterol_mg`, `sodium_mg`, `total_carbs_g`, `fiber_g`, `total_sugars_g`, `added_sugars_g`), which are also the `food_items` column names. A nutrient value of **`null` means unknown**, never 0.

| Method | Path | What it does |
|---|---|---|
| GET | `/nutrition/preferences` | `{tracked_nutrients, nutrients}`: the keys the user tracks, **in display order**, and every nutrient the app knows (`{key, label, unit}`, in display order). Falls back to the defaults if the user has no row. |
| PUT | `/nutrition/preferences` | Replace `{tracked_nutrients}`. Duplicates are dropped and the list is stored in display order; may be empty. An unknown key → 422. Returns the same shape as GET. |
| GET | `/nutrition/foods` | The food repo (`FoodOut`), by name (case-insensitive): `id`, `name`, `description`, `standard_quantity`, `standard_unit`, the eleven nutrients (per one standard quantity, each nullable) and `last_logged_on` (latest day it was logged, or null). Deleted foods are left out. |
| POST | `/nutrition/foods` | Create (`FoodIn`): `name` (1–100 chars), `description?` (≤500), `standard_quantity` (> 0), `standard_unit` (1–30 chars), and any nutrients (≥ 0; omitted or null = unknown). Name and unit are trimmed. A name already in the repo (case-insensitive) → **409**. 201. |
| PUT | `/nutrition/foods/{id}` | Replace a food (same body, sent in full). Past days that logged it are recalculated with the new values. Duplicate name → 409. |
| DELETE | `/nutrition/foods/{id}` | Soft-delete. Days that logged it still show it (`food_deleted: true`), but it can't be logged again; its name can be reused. 204. |
| GET | `/nutrition/days` | Days with something logged (`DaySummary`: `date`, `entry_count`, `totals`), newest first. Query: `limit` (1–100, default 30) and `before` (a date; pass the last date seen to get the next page). |
| GET | `/nutrition/days/{date}` | One day's sheet (`DayOut`): `date`, `entries` (oldest logged first) and `totals`. A day with nothing logged returns empty entries and totals of `"0.000000"`. |
| POST | `/nutrition/logs` | Log `{food_item_id, eaten_on, servings, notes?}`. `servings` (> 0) is a multiple of the food's standard quantity. A food that doesn't exist, is deleted or is another user's → 404. Returns the entry (`LogOut`). 201. |
| PUT | `/nutrition/logs/{id}` | Replace `{eaten_on, servings, notes}` (sent in full). The food can't change. Returns `LogOut`. |
| DELETE | `/nutrition/logs/{id}` | Soft-delete the entry. 204. |
| GET | `/nutrition/goals` | Goals in effect on a day (`GoalOut`: `id`, `nutrient`, `kind`, `amount`, `starts_on`, `ends_on`), targets first, then by nutrient key. Query `on` (a date) defaults to today in the user's timezone. |
| POST | `/nutrition/goals` | Create `{nutrient, kind, amount}`: `kind` is `target` (reach at least) or `limit` (stay under), `amount` > 0. Starts today (user's timezone). There's already an active goal of that kind for the nutrient → **409**. 201. |
| PUT | `/nutrition/goals/{id}` | Change `{amount}` from today on. A goal that started today is changed in place; otherwise the old one ends yesterday and a **new goal (new `id`)** starts today, so earlier days keep the old amount. Nutrient and kind can't change. Only active goals; else 404. |
| DELETE | `/nutrition/goals/{id}` | Remove from today on: a goal that started today is soft-deleted, otherwise it ends yesterday and still covers earlier days. 204. |

**Log entries** (`LogOut`): `id`, `food_item_id`, `food_name`, `food_deleted`, the food's `standard_quantity` and `standard_unit`, `eaten_on`, `servings`, `notes`, and `nutrients`: each of the food's values × `servings` (rounded to 6 decimal places), `null` where the food has no value.

**Totals** (`NutrientTotal`, one per nutrient, all eleven): `amount` is the sum of the **known** values (`null` when entries exist but none has a value) and `missing_foods` lists the foods logged that day with no value for it. The rules live in `service.day_totals`.

**Errors:**
- **404**: the food, log entry or goal doesn't exist, is deleted (for goals: isn't active), or belongs to another user. Logging a deleted or unknown food is also 404.
- **409**: a duplicate food name, or a second active goal of the same kind for a nutrient (`unique_errors` in `routes/_common.py` catches the unique violation inside a savepoint).
- **422**: request validation (Pydantic): unknown nutrient keys, negative nutrients, `servings` / `standard_quantity` / goal `amount` not above 0, too many decimal places, over-long text.

---

## 8. Run, test, lint

Requires Docker (for Postgres) and **uv**.

| Command | What it does |
|---|---|
| `make api-install` | `uv sync`: install dependencies into `api/.venv`. |
| `make api` | Applies pending migrations, then serves http://localhost:8000 with auto-reload, as `disci_api` with dev auth. |
| `make api-test` | Rebuilds the `disci_test` database from the migrations, then runs `pytest`. |
| `make api-lint` | `ruff check` and `ruff format --check`. |
| `make jobs-recurring` | Applies pending migrations, then runs the recurring-transactions job once against the local database, as `disci_api` (AWS runs it hourly; see §9.1). |

**Tests** run against `disci_test`, a separate database in the same local Postgres, so your dev data is untouched. Each test starts with empty tables (an autouse fixture truncates them as the owner). Use `as_user("<sub>")` from `tests/conftest.py` to send requests as a given dev user. **84 tests** in total. The **25 core tests** cover user creation, settings validation, per-user isolation, an email-less (MCP) identity getting 403 until a web sign-in creates the user and then finding it, RLS (as `disci_api` with no `app.user_id`, no rows are visible), module enable/disable, the prod dev-auth guard and the AWS code paths below. The **21 finance tests** (`tests/modules/finance/test_finance.py`) cover period bounds and default names, category seeding on enable, per-kind custom categories, uncategorizing on category delete, multiple budgets per period, Uncategorized items, the item/category kind check, opposite-kind netting, the per-budget allocation cap, counting the same dollars in two budgets, transaction delete, editing a transaction (`GET` shows its allocations; `PUT` changes its fields and moves / adds allocations, rejects an allocation over the amount, and 404s for another user), cross-user isolation, and copying a budget (items carried over without transactions, same period type required, no copying another user's budget). The **26 recurring tests** (`tests/modules/finance/test_recurring.py`) cover occurrence dates for every frequency (including the yearly Feb 29 clamp and `ends_on`), rule validation, `next_occurrence`, auto-apply (creating the item planned for every occurrence in the period, matching an existing item by name, hitting every covering budget, idempotency), landing unassigned without auto-apply, the approve/reject flow and a rejected occurrence never coming back, the job running for every user, the checklist (monthly budgets only; done only once the confirmed actual reaches the plan, partial payments not enough; pending transactions ignored and refunds netted; a $0-planned item needs something logged; a recurring payment meeting the plan completes it), reordering categories and items, and category descriptions and transaction notes. The **12 nutrition tests** (`tests/modules/nutrition/test_nutrition.py`) cover the default tracked nutrients on enable, saving tracked nutrients de-duplicated in display order (unknown key → 422), food names unique per user ignoring case (a deleted food's name reusable) and unknown nutrients staying null, editing a food recalculating past days, day totals (servings multiplied, known values summed, `missing_foods` listed, null when nothing is known, 0 on an empty day), food values keeping 6 decimal places (a 7th place → 422), editing and deleting log entries, a deleted food staying on past days but not loggable, history newest first with the `before` cursor, cross-user isolation (foods, days, logging, goals), goal targets and limits (one active of each kind per nutrient) and changing / removing a goal while past days keep the old one.

`tests/core/test_aws.py` exercises the production-only code paths locally:
- **Cognito mode** builds requests the way Mangum does from an API Gateway event: verified ID-token claims → `Identity`; an MCP-client access token → `Identity` with no email; that access token is rejected (401) when `mcp_client_id` is unset; no claims, another client's access token, an access token without `client_id` or an ID token without email → 401; the `X-Dev-User` header is ignored.
- **`IamAuthConnection`** with `rds_auth_token` monkeypatched: the token is used as the password (the local `disci_api` password stands in for a signed token) and is requested for the right host/port/user; a wrong token fails to connect.

---

## 9. Running on AWS

Built into one zip by `scripts/build-api-zip.sh` (no Docker) and shipped by `scripts/deploy.sh`; see [deployment.md](../ops/deployment.md) for the full flow.

| Lambda | Handler | What it does |
|---|---|---|
| `disci-api` | `app.lambda_handler.handler` | `Mangum(app, lifespan="auto")`: turns API Gateway HTTP API (payload v2) events into ASGI requests for the FastAPI app. |
| `disci-migrator` | `app.migrator.handler` | Connects as the RDS master user (`DISCI_MIGRATOR_DATABASE_URL`), runs `db/aws/roles.sql` (idempotent: ensures `disci_app`, `disci_api`, `rds_iam` grant), then the bundled `bin/dbmate --no-dump-schema --migrations-dir db/migrations up`. Raises if dbmate fails, which stops the deploy before the API is updated. Returns dbmate's output. |
| `disci-jobs` | `app.jobs.recurring.handler` | Scheduled work, triggered hourly by EventBridge Scheduler. Today it only creates due recurring transactions (§9.1). Same environment variables as `disci-api`. |

The MCP server (`disci-mcp`) is a separate project and zip (`mcp_server/`, [mcp-overview.md](../mcp/mcp-overview.md)) that calls this API over HTTP. Its finance and nutrition tools wrap the §7.1 and §7.2 endpoints; nothing in the API is MCP-specific beyond accepting its access tokens (§3).

The deploy runs the migrator **before** updating the API, so migrations must be backward compatible with the live API (expand/contract). `disci-jobs` gets the same zip right after `disci-api`.

### 9.1 Scheduled jobs (`app/jobs/`)

`app/jobs/recurring.py` runs `run()`:

1. Connects as the API's database login (`disci_api`, IAM auth when `DISCI_DB_IAM_AUTH=true`, so in production it signs its own token), not as the owner, so **RLS applies**.
2. Calls `finance.users_with_recurring()`, a narrow `SECURITY DEFINER` function that returns only `(user_id, timezone)` for users with active rules (see [db-overview.md](../db/db-overview.md) §2).
3. For each user, in **its own transaction**: sets `app.user_id`, then runs `generate_for_user` (`finance/recurring.py`) with today's date **in that user's timezone**. A failure for one user is logged and rolled back without blocking the others.
4. Returns and logs `{users, created}`.

Generation is idempotent (one transaction per rule per date, ever; see [finance.md](../db/finance.md) §4), so extra or retried runs are harmless. The API calls the same `generate_for_user` right after a rule is created or updated. Locally: `make jobs-recurring`.
