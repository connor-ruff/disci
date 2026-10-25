# Shared Tables (`core` schema)

*Status: planning draft. See [db-overview.md](db-overview.md) for conventions.*

Tables that every module depends on: `users` and `user_modules` (which modules each user has turned on).

---

## `core.users`

One row per person who can sign in. Identity itself (passwords, OAuth) lives in **Cognito**. This table is the app's own record of the user, keyed to Cognito by `cognito_sub`.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK. This is the `user_id` every other table references. |
| `cognito_sub` | `text` | no | Unique. The Cognito user's `sub` claim, used to map a JWT to a user row. |
| `email` | `text` | no | Unique (case-insensitive). Copied from Cognito for convenience and reports. |
| `display_name` | `text` | yes | |
| `timezone` | `text` | no | IANA name, e.g. `America/Chicago`. Decides which **day** a food log, task or transaction falls on, and when reports go out. |
| `week_starts_on` | `smallint` | no | Default `1` (Monday). Used for weekly budgets and "this week" views. *(See open question in the overview.)* |
| `created_at` / `updated_at` / `deleted_at` | `timestamptz` | | Standard audit columns. |

### What happens at first sign-in
The API creates the `users` row **lazily** on the first authenticated request whose `cognito_sub` it hasn't seen. There's no Cognito trigger. The new user starts with **no modules enabled**, and the UI prompts them to turn one on (see `user_modules`).

This also means a freshly reset local database needs no setup: sign in and your user row comes back.

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
- **First enable runs the module's setup** in the same transaction (e.g. finance copies the default budget categories into `finance.budget_categories`). Setup runs only when the row is first created, never on re-enable.
- **Turning a module off hides it; it doesn't delete anything.** Its data is untouched and reappears when it's turned back on.
- **v1 gating is UI-only**: disabled modules are hidden from navigation and the dashboard, but the API doesn't refuse their requests. This may be revisited so that MCP/Claude also respects it.

### Likely future additions
- **Report preferences** (morning/night report on or off, send time, channel). These could be columns here or a `core.user_settings` table once there are more than a few settings.
