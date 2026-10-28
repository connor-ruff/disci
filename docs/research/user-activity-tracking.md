# Research: tracking user activity

*Researched 2026-10-28. A point-in-time study, not kept current (doc rule 8). Nothing here is built. The roadmap items are in [roadmap.md](../roadmap.md).*

## The goal

Once Disci has a small number of invited users, see **how it's being used without looking at anyone's data**: how many users there are, who has signed in, when each was last active, requests per day (web vs. Claude), and how many records each user has in each module.

## 1. What already exists

| Question | Where the answer is today | Limits |
|---|---|---|
| Who is invited, and who has signed in | **Cognito** (`disci` pool, Essentials tier). Accounts are invite-only through `invited_emails` ([deployment.md](../ops/deployment.md)). `UserStatus`: `FORCE_CHANGE_PASSWORD` = invited, never set a password; `CONFIRMED` = has. `aws cognito-idp list-users --user-pool-id <id> --profile connor-ruff-dev-acct --region us-east-2` | No sign-in history (§2) |
| How many users, and when each started | **`core.users`**: a row is created on the first web request ([db/shared.md](../db/shared.md)), so `created_at` is "first used the web app" | Needs owner access (§1.1) |
| Requests per user per day, web vs. Claude | **`disci-api` request log** ([api-overview.md §4](../api/api-overview.md)): every line has `sub` (first 8 chars of the Cognito sub), `path`, `status` and `duration_ms`. Lines with a `caller_request_id` came through the MCP server; lines without one came from the web app | 14-day log retention; `sub` is an ID, matched to a person through `core.users.cognito_sub` |
| Records per user per module | The module tables, all keyed by `user_id` | Needs owner access (§1.1) |

Requests per user per day, split by channel (Logs Insights on `disci-api`; running queries: [deployment.md §2.3](../ops/deployment.md)):

```
filter logger = "app.requests" and ispresent(sub)
| stats count() as requests by sub, bin(1d) as day, ispresent(caller_request_id) as via_claude
| sort day desc
```

### 1.1 Reading across users

The API's database role is held to one user per transaction by row-level security, so cross-user counts only work as the **owner** (`disci`), through the laptop tunnel ([deployment.md §5](../ops/deployment.md)). That's the right boundary: there's no app endpoint that can see other users.

## 2. Sign-in history: not worth it

- Cognito records sign-in events (user auth events) only as part of its paid **Plus** tier. The pool is on **Essentials**.
- It also means little here. Refresh tokens last 30 days, so a daily user might sign in once a month. **Active days** (from request logs, or `last_seen_at` in §3) measure use far better.

## 3. Suggested additions (lean)

1. **`core.users.last_seen_at`** (`timestamptz`, nullable). The API updates it at most once per user per day, with a no-op unless the stored date isn't today, e.g. `UPDATE core.users SET last_seen_at = now() WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < date_trunc('day', now()))`. That gives "last active" and churn permanently, independent of log retention. Cost: one small write per user per day. It would also need the API to touch it on MCP requests (identified through `core.find_user`), or Claude-only use would look inactive.
2. **An admin stats query** checked into the repo (e.g. `db/admin/user_stats.sql`), run by hand as the owner. One row per user: `email`, `created_at`, `last_seen_at`, enabled modules (`core.user_modules`), and **counts only** from the module tables (e.g. transactions, food log entries, task completions). No deploy and no cost. It must never select content columns.
3. **Later, in Snowflake:** once logs reach Snowflake ([log-export-to-snowflake.md](log-export-to-snowflake.md)) and the roadmap's Snowflake reporting layer exports app data, this becomes a dashboard: daily active users, requests by channel, per-module adoption, all joined on `cognito_sub`. With logs kept past 14 days, `last_seen_at` becomes a convenience rather than a necessity.

**Not suggested now:** an admin page in the app. It would need an admin role, cross-user endpoints (which break the "no endpoint sees other users" boundary in §1.1) and a UI, for a view checked occasionally.

## 4. Privacy

- As the database owner, the operator *can* read every user's entries (finances, food, tasks). Tracking counts only is a habit, not something the system enforces.
- Before inviting people, tell them plainly what's collected (activity: requests, dates, record counts; never contents) and that their entries aren't looked at. A short note in the invite email or the app covers it.
- The current logging supports that promise: request lines carry a truncated `sub`, never tokens, query strings or bodies ([api-overview.md §4](../api/api-overview.md)).

## 5. Numbers on 2026-10-28

Cognito pool `disci`: Essentials tier, 2 users, both `CONFIRMED`.
