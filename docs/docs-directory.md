# Documentation Directory

All documentation lives under `docs/`. Start here.

```
docs/
├── docs-directory.md              # You are here: entry point and doc rules
├── roadmap.md                     # Everything not built yet, cleanup steps and open questions (the only backlog)
├── project_plans/                 # Historical: the plans written before the build (not kept up to date)
│   ├── project-inspiration.md     # Why Disci exists: the old trackers, the vision, design principles
│   └── disci-infrastructure.md    # Original infra & cost plan (as built: ops/deployment.md)
├── research/                      # Point-in-time studies of options not built yet (dated, not kept up to date)
│   ├── log-export-to-snowflake.md            # Goal, constraints and comparison of ways to get logs into Snowflake
│   ├── log-export-option-a-firehose-s3.md    # Option A: Firehose → S3 → external table
│   ├── log-export-option-b-cloudwatch-s3-tables.md  # Option B: CloudWatch S3 Tables (Iceberg) → Snowflake catalog integration
│   └── user-activity-tracking.md             # Seeing how invited users use Disci (counts, activity) without reading their data
├── ops/
│   ├── deployment.md              # Production on AWS: architecture, resources, logs, alarms, deploys, snapshots, DB access, security
│   └── cost.md                    # Monthly cost, the free-tier ledger (what Disci uses of each allowance), checking spend, guardrails
├── mcp/
│   └── mcp-overview.md            # MCP server (Claude connector): Cognito auth, layout, settings, the tools, local dev, Lambda, connecting
├── api/
│   └── api-overview.md            # FastAPI back end: layout, settings, auth, request flow, SQL conventions, adding a module, endpoints, tests, jobs
├── db/                            # Postgres data model, one file per module (Postgres schema)
│   ├── db-overview.md             # Modules and the conventions every table follows
│   ├── shared.md                  # core: users, user_modules, helper functions
│   ├── finance.md                 # budgets, items, transactions, allocations, recurring rules, Inbox entries, preferences
│   ├── nutrition.md               # food repo, food log and quick adds, goals, tracked nutrients
│   └── tasks.md                   # four fixed task types, tasks + task_completions
└── ui/                            # Front end
    ├── ui-overview.md             # Brand palette and look
    ├── app-shell.md               # Shell, module menu, opt-in modules, Settings page, how modules plug in
    ├── web-overview.md            # Web app engineering: stack, folder layout, API client, theming, mobile conventions, local dev
    ├── finance-ui.md              # Finance screens
    ├── nutrition-ui.md            # Nutrition screens
    └── tasks-ui.md                # Tasks screens
```

**Where to start:** to change a module, read its `db/` doc, its section of `api/api-overview.md` §7 and its `ui/` doc. For anything about production, read `ops/deployment.md`, and `ops/cost.md` before adding AWS resources. For what to build next, read `roadmap.md`.

---

## Doc rules

These keep the docs accurate and stop them filling up with forgotten notes.

1. **Docs describe what exists now.** When code changes, update the docs in the same change. Don't write changelog phrasing ("previously", "no longer", "was renamed", "now does"). Git history has the past. The one exception is the reasoning behind a decision, in a module's **Decisions** table: it says *why* things are the way they are, not what they used to be.
2. **Everything not built goes in `roadmap.md`, and only there.** That covers future features, "revisit later" notes, cleanup steps (like the contract half of an expand/contract migration) and questions waiting on a decision. Other docs link to it rather than keeping their own lists. When an item is done, delete its line. When a question is decided, record the answer in the module's Decisions table and delete it from the roadmap.
3. **No deploy status or branch names.** Everything on `main` is deployed (CI deploys every push), so "built but not deployed yet" notes go stale within a day.
4. **Don't track what tools already track.** Don't write test counts, exhaustive test inventories, or lists of migration file names. Run the tests, look in `db/migrations/`, or read `db/schema.sql`. Say what a file *covers*, not what each test checks.
5. **One home per fact.** If two docs need the same detail, keep it in one and link to it from the other.
6. **`project_plans/` is frozen.** It records the reasoning before the build. Don't update it to match the code; current docs supersede it.
7. **Every AWS change is costed.** A change that adds an AWS resource (an alarm, a metric, a Lambda, a secret...) or noticeably more usage updates [ops/cost.md](ops/cost.md) in the same change: its §1 cost table if it costs money, and its free-tier ledger if it uses an allowance. The free tier is shared across the whole account, so check the ledger before adding.
8. **`research/` is point-in-time.** It saves the research behind a roadmap decision that hasn't been made yet: options, sources, costs, risks. Each file is dated and isn't updated as AWS or Snowflake change; re-check before acting on it. The roadmap item links to it. When the item is built, the result is documented in the normal docs and the research file can be deleted (git keeps it).
