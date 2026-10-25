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
├── api/                           # Back-end API docs (FastAPI, api/ folder)
│   └── api-overview.md            # Start here: layout, settings, auth, request flow, modules, endpoints
├── db/                            # Postgres data model docs (one file per module)
│   ├── db-overview.md             # Start here: modules, conventions, open questions
│   ├── shared.md                  # core schema: users, user_modules, helper functions
│   ├── finance.md
│   ├── tasks.md
│   └── nutrition.md
└── ui/                            # Front-end layout & UX docs
    ├── ui-overview.md             # General style guidelines
    ├── app-shell.md               # Shell, module menu, opt-in modules, how modules plug in
    ├── web-overview.md            # Web app engineering: stack, layout, API client, theming, local dev
    └── finance-ui.md              # Finance screens: routes, budget page, forms, what the numbers mean
```

## project_plans 

Contains initial planning / architecture docs.

## ops

Contains documentation about running Disci in production on AWS. Start with `ops/deployment.md`, the ops entry point and source of truth for what was built: the architecture and resources (OpenTofu in the `aws_iac_mngr` repo), how a deploy works from a laptop or CI, infrastructure changes and Cognito users, database access through the EC2 Instance Connect tunnel, the security model, cost and the budget, and known follow-ups.

## api

Contains documentation about the back-end API (`api/`). Start with `api/api-overview.md`, which covers the code layout, settings and auth modes, the per-request transaction, SQL conventions, how to add a module, the current endpoints and how to run and test it locally.

## db

Contains documentation about the Postgres data model used in the back-end of the application. Start with `db/db-overview.md`, which lists each module (its own Postgres schema), the conventions every table follows, and links to each module's doc.

## ui

Contains documentation on front-end layout and user experience. Start with `ui/app-shell.md`, which covers the frame every page lives in and how modules plug into it, and `ui/web-overview.md` for the web app's engineering side (stack, folder layout, API client, theming, mobile conventions, local dev). Module-specific screens have their own docs, e.g. `ui/finance-ui.md`.