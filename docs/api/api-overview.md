# API Overview

*Status: **skeleton implemented** in `api/`. Core endpoints (`/me`, `/me/modules`) work; the finance module is a stub with no endpoints yet. Cognito auth comes with the AWS infrastructure.*

The API is the only thing that talks to the database. The web app, the MCP server and the scheduled jobs all go through it (see [disci-infrastructure.md](../project_plans/disci-infrastructure.md)). It is **FastAPI** on Python 3.13, with plain SQL through **psycopg 3** (no ORM), managed with **uv**.

---

## 1. Layout

```
api/
├── pyproject.toml / uv.lock       # deps: fastapi, psycopg[binary], psycopg-pool, pydantic-settings
│                                  # dev: uvicorn, pytest, httpx, ruff
├── app/
│   ├── main.py                    # builds the app: CORS, /health, core routers, mounts each module at /<key>
│   ├── core/                      # cross-module plumbing
│   │   ├── settings.py            # Settings from DISCI_* env vars
│   │   ├── auth.py                # request → Identity (sub, email)
│   │   ├── db.py                  # connection pool, per-request transaction (DbDep)
│   │   ├── sql.py                 # Queries: loads queries/<name>.sql
│   │   ├── module.py              # Module dataclass (what a module registers)
│   │   ├── queries/               # ensure_user.sql, set_user.sql
│   │   ├── users/                 # GET/PUT /me (router, schemas, queries/)
│   │   └── user_modules/          # GET /me/modules, PUT/DELETE /me/modules/{key}
│   └── modules/
│       ├── __init__.py            # MODULES registry
│       └── finance/               # stub: `module` + empty router at /finance
└── tests/                         # pytest, against the disci_test database
    ├── conftest.py
    └── core/                      # test_users.py, test_user_modules.py
```

A full module is expected to grow into `router.py` (thin HTTP routes), `schemas.py` (Pydantic models), `service.py` (business rules) and `queries/` (one `.sql` per query).

---

## 2. Settings

Read from environment variables with the `DISCI_` prefix (`core/settings.py`).

| Variable | Values | Default | Notes |
|---|---|---|---|
| `DISCI_ENV` | `local`, `test`, `prod` | none | |
| `DISCI_DATABASE_URL` | Postgres URL | none | Locally: `postgresql://disci_api:disci_api@localhost:5432/disci` |
| `DISCI_AUTH_MODE` | `dev`, `cognito` | none | `dev` is **refused when `DISCI_ENV=prod`** (startup fails). |
| `DISCI_CORS_ORIGINS` | JSON list | `["http://localhost:5173"]` | The Vite dev server. |

The first three have **no defaults on purpose**: a misconfigured deploy fails at startup instead of quietly running with local values. `make api` and the tests set them for you.

---

## 3. Auth

| Mode | Who the request acts as |
|---|---|
| `dev` | `local-dev-user` (the user seeded by `db/seeds/dev.sql`), or whatever `sub` is in the **`X-Dev-User`** header. Email becomes `<sub>@disci.local`. Lets you test as several users locally. |
| `cognito` | Not implemented yet: returns **501**. JWT verification arrives with the AWS infrastructure. |

Auth produces an `Identity(sub, email)`; it never touches the database itself.

---

## 4. Request flow

Endpoints that need the database take `db: DbDep` (`core/db.py`). For each request it:

1. Takes a connection from the pool and opens **one transaction**.
2. Calls `core.ensure_user(sub, email)`, creating the `core.users` row on first sign-in.
3. Runs `set_config('app.user_id', <id>, true)` (same as `SET LOCAL`, but takes a bound parameter), so row-level security exposes only that user's rows.
4. Hands the endpoint `Db(conn, user_id)`.
5. **Commits** if the endpoint returns, **rolls back** if it raises.

The dependency uses `Depends(get_db, scope="function")`, so the commit happens **before** the response is sent: a client never sees success for a write that failed to commit.

**Database role.** The API connects as a login role that is a member of `disci_app` and does not own any tables, so RLS applies. Locally that is `disci_api` (created by `db/local/roles.sql`). Never connect the API as the owner `disci`, which bypasses RLS. Production will create its own equivalent using RDS IAM auth.

---

## 5. SQL conventions

- Every SQL statement lives in a `queries/<name>.sql` file inside the package that uses it.
- Load by name: `queries = Queries(__file__)`, then `conn.execute(queries["get_user"], params)`.
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
| GET | `/health` | `{"status": "ok"}`. No auth, no database. |
| GET | `/me` | The current user (`id`, `email`, `display_name`, `timezone`, `week_starts_on`). Creates the user on first call. |
| PUT | `/me` | Replace the user's settings: `display_name` (≤100 chars, nullable), `timezone` (IANA name), `week_starts_on` (1–7). Invalid values → 422. |
| GET | `/me/modules` | Every registered module (`key`, `name`, `description`, `enabled`). |
| PUT | `/me/modules/{key}` | Enable a module. Idempotent. First enable runs the module's `setup`. Unknown key → 404. |
| DELETE | `/me/modules/{key}` | Disable a module. Its data is kept and comes back on re-enable. Unknown key → 404. |
| * | `/finance/...` | Finance module (no endpoints yet). |

---

## 8. Run, test, lint

Requires Docker (for Postgres) and **uv**.

| Command | What it does |
|---|---|
| `make api-install` | `uv sync`: install dependencies into `api/.venv`. |
| `make api` | Applies pending migrations, then serves http://localhost:8000 with auto-reload, as `disci_api` with dev auth. |
| `make api-test` | Rebuilds the `disci_test` database from the migrations, then runs `pytest`. |
| `make api-lint` | `ruff check` and `ruff format --check`. |

**Tests** run against `disci_test`, a separate database in the same local Postgres, so your dev data is untouched. Each test starts with empty tables (an autouse fixture truncates them as the owner). Use `as_user("<sub>")` from `tests/conftest.py` to send requests as a given dev user. Tests cover user creation, settings validation, per-user isolation, RLS (as `disci_api` with no `app.user_id`, no rows are visible), module enable/disable and the prod dev-auth guard.
