# Roadmap

The **one place** for everything Disci doesn't do yet: unbuilt features, cleanup steps, and questions waiting on a decision. Other docs describe what exists today and link here instead of carrying their own "later" or "open question" notes (see the doc rules in [docs-directory.md](docs-directory.md)).

When something here gets built, delete its line and document the result in the relevant doc. When an open question is decided, record the decision in that module's **Decisions** table and delete it here.

Last reviewed: 2026-10-27.

---

## 1. Now: cleanup and small fixes

| Item | Notes |
|---|---|
| **Finance: drop `recurring_transactions.requires_approval`** | A migration that drops the column, in a release after `20261028120000_finance__fold_requires_approval.sql` is deployed. That migration folded it into `auto_apply`, and no code references it any more. |
| **Delete the RDS snapshot `disci-pre-inbox-2026-10-27`** | Once the Inbox rework has run in production for a while without problems. Command in [deployment.md](ops/deployment.md) §3. |
| **Alarms** | No CloudWatch alarms exist. At least: errors on `disci-jobs` (a failed recurring run is silent today) and on `disci-mcp`. |
| **MCP: the mid-handshake HTTP 400** | Harmless. Claude sends `server/discover`, which mcp 1.30 doesn't know ([mcp-overview.md](mcp/mcp-overview.md) §1). Likely fixed by moving to mcp 2.x, which has breaking API changes, so it's a change of its own. |

## 2. Next: the rest of the original vision

From [project-inspiration.md](project_plans/project-inspiration.md) §3, these are the pieces not built yet.

| Item | Notes |
|---|---|
| **Morning and night reports** | Morning: what's due and coming up. Night: what got done today. Tasks can already be read from `GET /tasks` and `GET /tasks/completions`. **Open: delivery.** Email via SES (needs an SES identity, a report job on `disci-jobs` and a schedule) or a Claude scheduled task that reads Disci through the MCP server (no new infra, more conversational), or both. If report settings are needed (on/off, send time, channel), they could be columns on `core.users` or a `core.user_settings` table. |
| **Moving off the old trackers** | Import the food repo and the task list from their Google Sheets. **Open:** are EveryDollar's past expenses wanted, and how far back? |
| **Goals on the nutrition daily sheet** | Progress toward targets and warnings near limits. The Home card already shows them, and the API serves goals for any day (`GET /nutrition/goals?on=`). |
| **Connector setup in Settings** | A Settings section showing each user the MCP URL, client ID and shared secret, plus the setup steps for Claude and for Instinct AI. Draft notes for the Instinct steps are in `docs/user_guides/` (not committed). |

## 3. Later: feature backlog

**Finance**
- Split a transaction across items, and allocate one transaction to more than one budget, from the UI. The API already accepts several allocations.
- Rename a budget and edit its notes in the UI (`PUT /finance/budgets/{id}` exists).
- Fast entry helpers: recent payees, and the last item used for a payee.
- **Open:** when a paused recurring rule is resumed, it catches up on the dates it missed while paused. Should it skip them instead?

**Nutrition**
- Turn a quick add into a repo food ("save this to my repo").
- Meals (breakfast, lunch, ...): a nullable `meal` column on `food_item_logs`.
- Recipes or saved meals ("my usual breakfast"): `recipes` + `recipe_items`.
- Other logs: body weight, water.
- Food versioning, if recalculating past days when a food is edited turns out to be wrong.
- Day-dependent goals (training vs. rest days): a day-type dimension on `macro_goals`.

**Tasks**
- Visualizations: streaks, history, calendars. The user will send inspiration.
- Reorder tasks within a list: a `sort_order` column like finance's.
- Check off a past day, and a "what I did today" view, in the UI. The API supports both (`{on}`, `GET /tasks/completions`).
- Creating, editing and undoing tasks through Claude. The MCP tools only read tasks and log completions today.

**Shell and platform**
- An "everything" dashboard across modules.
- Enforce module on/off in the API, so Claude respects it too. Today only the web UI hides disabled modules.
- Custom domain: Route 53, an ACM certificate in us-east-1 for CloudFront (plus one in us-east-2 for an API custom domain), and new Cognito callback and logout URLs and CORS origins.
- Cognito login from `localhost`, which needs `http://localhost:5173` callback URLs or a second client.
- Snowflake reporting layer: a nightly export to S3, then Snowpipe ([disci-infrastructure.md](project_plans/disci-infrastructure.md)).
- A mobile app. For now, the home-screen web app.

## 4. Open questions

The questions above that need a decision, gathered here:

1. How should reports be delivered: SES email, Claude scheduled tasks, or both? (§2)
2. Import EveryDollar's past expenses, and if so, how far back? (§2)
3. Should a resumed recurring rule skip the dates it missed while paused? (§3)
4. Should the module menu have a fixed order or one the user can arrange? Today it uses the order the API returns.
5. Is one summary card per module the right Home page?
