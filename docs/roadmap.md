# Roadmap

The **one place** for everything Disci doesn't do yet: unbuilt features, cleanup steps, and questions waiting on a decision. Other docs describe what exists today and link here instead of carrying their own "later" or "open question" notes (see the doc rules in [docs-directory.md](docs-directory.md)).

When something here gets built, delete its line and document the result in the relevant doc. When an open question is decided, record the decision in that module's **Decisions** table and delete it here.

Last reviewed: 2026-10-31.

---

## 1. Now: cleanup and small fixes

| Item | Notes |
|---|---|
| **Delete the RDS snapshot `disci-pre-inbox-2026-10-27`** | Once the Inbox rework has run in production for a while without problems. Command in [deployment.md](ops/deployment.md) §3. |
| **MCP: the mid-handshake HTTP 400** | Harmless. Claude sends `server/discover`, which mcp 1.30 doesn't know ([mcp-overview.md](mcp/mcp-overview.md) §1). Likely fixed by moving to mcp 2.x, which has breaking API changes, so it's a change of its own. |

## 2. Next: the rest of the original vision

From [project-inspiration.md](project_plans/project-inspiration.md) §3, these are the pieces not built yet.

| Item | Notes |
|---|---|
| **Training module: dashboard and lift progression** | The workout log and training plans are built ([training.md](db/training.md)). Still to come, one PR each: **Dashboard and brief**: a Dashboard tab (This week / Overall, weekly mileage chart, totals, % of plan, days to race), `GET /training/brief` and a `get_training_brief` MCP tool for daily agent messages (today's planned workout, yesterday, the week's status and cross-training cue from the existing week rules, plan progress, recent reflections), and a user guide with suggested Instinct instructions. **Open:** what the dashboard shows without a plan (§4). **Lift progression**: a per-lift history and progression page (top set, volume, estimated 1RM), opened from a lift in the log; the API's `GET /training/lifts/{id}` already returns its sessions. The draft brief shape, metrics and phases are in [project_plans/training-module.md](project_plans/training-module.md). |
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

**Shopping list**
- Managing shopping types and common items through Claude. The MCP tools only work with the list itself.
- Sharing a list with another user (a partner or housemate). Lists are per user today.

**Training**
- Editing a workout through Claude (an `update_workout` tool). The MCP tools log, list and delete workouts.
- Managing the lift catalog in the app: rename, describe or delete a lift. The API has the endpoints (`/training/lifts`); today lifts are only added by logging them.
- Reading and managing plans through Claude: plan vs. done for a week (a `get_training_week` tool), and creating or editing a plan. No MCP tool touches plans today; they're managed in the web app.
- Plan vs. done on the Home card: this week's miles against the band and days to race, when there's an active plan. The card shows workouts only today.
- Ending the active plan, or deleting it, from the Plan page without starting or activating another. The API supports both (`PUT /training/plans/{id}/active` with `false`, `DELETE /training/plans/{id}`).
- The ±10% band width as a per-plan rule setting, next to `count_walk_miles` and `cross_train_at_pct`.

**Shell and platform**
- An "everything" dashboard across modules.
- Enforce module on/off in the API, so Claude respects it too. Today only the web UI hides disabled modules.
- Custom domain: Route 53, an ACM certificate in us-east-1 for CloudFront (plus one in us-east-2 for an API custom domain), and new Cognito callback and logout URLs and CORS origins.
- Cognito login from `localhost`, which needs `http://localhost:5173` callback URLs or a second client.
- Snowflake reporting layer: a nightly export to S3, then Snowpipe ([disci-infrastructure.md](project_plans/disci-infrastructure.md)).
- **Log export to Snowflake:** query the Lambda logs from Snowflake (history past 14 days, dashboards, joins with app data), keeping AWS lean and spending Snowflake compute only at query time. Researched in [research/log-export-to-snowflake.md](research/log-export-to-snowflake.md). CloudWatch's S3 Tables integration (Iceberg) is preferred, but needs a test that Snowflake can read CloudWatch's AWS-managed table bucket. **Open:** which option, and when.
- A mobile app. For now, the home-screen web app.
- **User activity tracking**, before inviting more users: a `core.users.last_seen_at` column the API sets at most once a day (web and MCP), and an owner-only admin SQL file with per-user counts (never contents). Researched in [research/user-activity-tracking.md](research/user-activity-tracking.md). Dashboards later come from the Snowflake items above.

## 4. Open questions

The questions above that need a decision, gathered here:

1. Should a resumed recurring rule skip the dates it missed while paused? (§3)
2. Should the module menu have a fixed order or one the user can arrange? Today it uses the order the API returns.
3. Is one summary card per module the right Home page?
4. How should the logs reach Snowflake: CloudWatch's S3 Tables integration, Firehose → S3, or not at all for now? (§3, [research](research/log-export-to-snowflake.md))
5. What should the Training dashboard show for a user without a plan? As drawn it's run-centric (run miles, a weekly mileage chart); a lifter with no plan probably wants workouts and time per week and recent lifts instead. (§2)
6. What do invited users get told about what's tracked (activity and counts, never contents), and where: the invite email or the app? (§3, [research](research/user-activity-tracking.md))
