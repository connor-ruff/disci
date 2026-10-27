# Documentation Directory 

All documentation is organized into sub-folders under the `docs/` directory.

```
docs/
├── docs-directory.md              # You are here: entry point for all docs
├── project_plans/                 # Initial planning / architecture docs
│   ├── disci-infrastructure.md    # original infra & cost plan (as-built: ops/deployment.md)
│   └── project-inspiration.md
├── ops/                           # Running the app in production (AWS)
│   └── deployment.md              # Start here: architecture as built, resources, deploys, DB access, security, cost
├── mcp/                           # MCP server (Claude connector, mcp_server/ folder)
│   └── mcp-overview.md            # Start here: status, auth test findings, server layout/settings, the 17 finance/nutrition tools, local dev, Lambda, connecting Claude, checklist
├── api/                           # Back-end API docs (FastAPI, api/ folder)
│   └── api-overview.md            # Start here: layout, settings, auth, request flow, modules, endpoints
├── db/                            # Postgres data model docs (one file per module)
│   ├── db-overview.md             # Start here: modules, conventions, open questions
│   ├── shared.md                  # core schema: users, user_modules, helper functions
│   ├── finance.md
│   ├── tasks.md                   # four fixed task types, tasks + task_completions
│   └── nutrition.md
└── ui/                            # Front-end layout & UX docs
    ├── ui-overview.md             # General style guidelines
    ├── app-shell.md               # Shell, module menu, opt-in modules, how modules plug in
    ├── web-overview.md            # Web app engineering: stack, layout, API client, theming, local dev
    ├── finance-ui.md              # Finance screens: routes, budget page, forms, what the numbers mean
    ├── nutrition-ui.md            # Nutrition screens: daily sheet, history, food repo, goals, unknown values
    └── tasks-ui.md                # Tasks screens: Today, All tasks, Kinds guide, check control, task sheet
```

## project_plans 

Contains initial planning / architecture docs.

## ops

Contains documentation about running Disci in production on AWS. Start with `ops/deployment.md`, the ops entry point and source of truth for what was built: the architecture and resources (OpenTofu in the `aws_iac_mngr` repo), how a deploy works from a laptop or CI, infrastructure changes and Cognito users (invite-only: inviting and removing people), database access through the EC2 Instance Connect tunnel, the security model, cost and the budget, and known follow-ups.

## mcp

Contains documentation for the MCP server (`mcp_server/`, so Claude can act on Disci data). Start with `mcp/mcp-overview.md`: status, what the Cognito auth test proved and how to repeat it, Python SDK notes, the server's layout, settings and auth, its 17 finance and nutrition tools (with the API endpoints behind each; no tasks tools yet) and design conventions, local dev and tests, the Lambda (and its Mangum lifespan gotcha), how to connect Claude, the checklist (decided vs open) and the historical stub source. Infrastructure lives in `ops/deployment.md` §2.2 and auth detail in §9.

## api

Contains documentation about the back-end API (`api/`). Start with `api/api-overview.md`, which covers the code layout, settings and auth modes, the per-request transaction, SQL conventions, how to add a module, the current endpoints (finance, nutrition and tasks) and how to run and test it locally.

## db

Contains documentation about the Postgres data model used in the back-end of the application. Start with `db/db-overview.md`, which lists each module (its own Postgres schema), the conventions every table follows, and links to each module's doc. Finance, nutrition and tasks are all implemented.

## ui

Contains documentation on front-end layout and user experience. Start with `ui/app-shell.md`, which covers the frame every page lives in and how modules plug into it, and `ui/web-overview.md` for the web app's engineering side (stack, folder layout, API client, theming, mobile conventions, local dev). Module-specific screens have their own docs: `ui/finance-ui.md`, `ui/nutrition-ui.md` and `ui/tasks-ui.md`.