# Documentation Directory 

All documentation is organized into sub-folders under the `docs/` directory.

```
docs/
├── docs-directory.md              # You are here: entry point for all docs
├── project_plans/                 # Initial planning / architecture docs
│   ├── disci-infrastructure.md
│   └── project-inspiration.md
├── db/                            # Postgres data model docs (one file per module)
│   ├── db-overview.md             # Start here: modules, conventions, open questions
│   ├── shared.md                  # core schema: users, user_modules, helper functions
│   ├── finance.md
│   ├── tasks.md
│   └── nutrition.md
└── ui/                            # Front-end layout & UX docs
    ├── ui-overview.md             # General style guidelines
    └── app-shell.md               # Shell, module menu, opt-in modules, how modules plug in
```

## project_plans 

Contains initial planning / architecture docs.

## db

Contains documentation about the Postgres data model used in the back-end of the application. Start with `db/db-overview.md`, which lists each module (its own Postgres schema), the conventions every table follows, and links to each module's doc.

## ui

Contains documentation on front-end layout and user experience. Start with `ui/app-shell.md`, which covers the frame every page lives in and how modules plug into it.