# Shared Tables (`core` schema)

*Status: **implemented** in `db/migrations/20261025134012_core__init.sql`; `core.find_user` added 2026-10-26 in `20261026170000_core__find_user.sql`. See [db-overview.md](db-overview.md) for conventions.*

Tables that every module depends on: `users` and `user_modules` (which modules each user has turned on). The schema also holds the shared helper functions (see the end of this doc).

---

## `core.users`

One row per person who can sign in. Identity itself (passwords, OAuth) lives in **Cognito**. This table is the app's own record of the user, keyed to Cognito by `cognito_sub`.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK. This is the `user_id` every other table references. |
| `cognito_sub` | `text` | no | Unique. The Cognito user's `sub` claim, used to map a JWT to a user row. |
| `email` | `text` | no | Unique (case-insensitive). Copied from Cognito for convenience and reports. |
| `display_name` | `text` | yes | |
| `timezone` | `text` | no | IANA name, e.g. `America/Chicago`. Default `'UTC'`. Decides which **day** a food log, task or transaction falls on. |
| `week_starts_on` | `smallint` | no | ISO day numbering: `1` = Monday ... `7` = Sunday, enforced by `CHECK (week_starts_on BETWEEN 1 AND 7)`. Default `1` (Monday). Used for weekly budgets and "this week" views. |
| `created_at` / `updated_at` / `deleted_at` | `timestamptz` | | Standard audit columns. |

### What happens at first sign-in
The API creates the `users` row **lazily** on the first authenticated request whose `cognito_sub` it hasn't seen, by calling `core.ensure_user(cognito_sub, email)` (see below). There's no Cognito trigger. The new user starts with **no modules enabled**, and the UI prompts them to turn one on (see `user_modules`).

This also means a freshly reset local database needs no setup: sign in and your user row comes back.

**MCP requests never create the row.** Claude's Cognito access tokens carry no `email`, so the API maps them with `core.find_user(cognito_sub)` instead, and a user with no row yet gets **403** ("Sign in to the Disci web app once first"). The existing `cognito_sub` column is the link; no extra column was needed.

---

## `core.user_modules`

Which modules a user has turned on. Modules are opt-in so new users aren't overwhelmed (see `docs/ui/app-shell.md`). The **list of modules that exist** is defined in code (a module registry), not in a table, because each module is code.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id`, `user_id` | `uuid` | no | |
| `module_key` | `text` | no | `CHECK IN ('finance','tasks','nutrition')`. Extended as modules are added. Matches the Postgres schema and code folder names. |
| `enabled_at` | `timestamptz` | no | When the module was (most recently) turned on. |
| `disabled_at` | `timestamptz` | yes | NULL means enabled. Turning a module off sets this and turning it back on clears it. |
| `created_at` / `updated_at` / `deleted_at` | `timestamptz` | | Standard audit columns. `created_at` = the first time the module was ever enabled. |

- Unique `(user_id, module_key)`: one row per user per module, flipped on and off rather than re-inserted.
- **First enable runs the module's setup** in the same transaction (e.g. finance copies the default budget categories into `finance.budget_categories`, and nutrition writes the default tracked nutrients into `nutrition.preferences`). Setup runs only when the row is first created, never on re-enable.
- **Turning a module off hides it; it doesn't delete anything.** Its data is untouched and reappears when it's turned back on.
- **API**: `GET /me/modules` lists modules with an `enabled` flag, `PUT /me/modules/{key}` enables (runs setup on first enable), `DELETE /me/modules/{key}` disables. The registry is `MODULES` in `api/app/modules/__init__.py`.
- **Gating is UI-only**: disabled modules are hidden from navigation and the dashboard, but the API doesn't refuse their requests (so Claude can still use them).

---

## Functions

| Function | Returns | Notes |
|---|---|---|
| `core.ensure_user(p_cognito_sub text, p_email text)` | `uuid` | Returns the user's `id`, inserting the `core.users` row first if this `cognito_sub` is new. Safe under concurrent first requests. **`SECURITY DEFINER`**, so it bypasses RLS: it has to run before `app.user_id` is known. `EXECUTE` is granted only to `disci_app`. |
| `core.find_user(p_cognito_sub text)` | `uuid` | The `id` of the non-deleted user with this `cognito_sub`, or NULL. Lookup only, never inserts. Used for MCP requests (identity without an email). **`SECURITY DEFINER`** (`STABLE`) for the same reason as `ensure_user`. `EXECUTE` is granted only to `disci_app`. |
| `core.current_user_id()` | `uuid` | The user the current request acts as, read from the `app.user_id` setting (which the API sets with `SET LOCAL` per transaction). NULL when unset, so RLS policies match nothing. Used by every RLS policy. |
| `core.set_updated_at()` | `trigger` | Sets `updated_at = now()`. Attached to every table as a `BEFORE UPDATE` trigger. |

Request flow (implemented in `api/app/core/db.py`, see [api-overview.md](../api/api-overview.md)): verify the identity, call `core.ensure_user(sub, email)` (or `core.find_user(sub)` when there is no email) to get the user id, then `set_config('app.user_id', '<id>', true)` (the bound-parameter form of `SET LOCAL`) and run the request's queries, all in one transaction.

**Local dev seed:** `db/seeds/dev.sql` creates a stand-in user (`cognito_sub = 'local-dev-user'`, `local-dev-user@disci.local`, `America/Chicago`) with the finance module enabled, for working on the API before Cognito login is wired up. It is the user the API acts as in dev auth mode when no `X-Dev-User` header is sent.
