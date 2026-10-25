# Disci: Infrastructure & Cost Overview

*Project name: **Disci** (short for discipline). Code/resource name: `disci`. Draft as of Oct 25, 2026. Prices are AWS on-demand list prices for us-east-1.*

## 1. What we're building

A single web app that replaces EveryDollar, the bills checklist, the to-do sheet and the nutrition sheets. It has three ways in:

- **Web UI**: live dashboards and manual input forms.
- **MCP server**: lets Claude read and write the same data ("I had an apple").
- **Scheduled jobs**: morning and night summary reports.

All three go through **one API**, which is the only thing that talks to the database.

```
  Browser ──► CloudFront ──► S3 (static React app)
     │
     └──────► API Gateway (HTTP API) ──► Lambda: api  ──┐
  Claude ───► API Gateway  /mcp ───────► Lambda: mcp ──┤──► RDS Postgres
  EventBridge Scheduler ───────────────► Lambda: jobs ─┘     (private subnet)
                                              │
                                              └──► SES (report emails)
  Cognito ── issues logins / OAuth tokens for the web app and the MCP connector
```

Snowflake is **not** in v1. It gets added later as a reporting layer (nightly export to S3, then Snowpipe), with no changes to the app.

## 2. Accounts needed

| Account | New? | Notes |
|---|---|---|
| AWS | No, use your existing account | Isolated by separate Terraform state plus `project=disci` tags, so it can move to its own account later. |
| GitHub | No | Two repos: your existing IaC repo and a new app repo. GitHub Actions deploys to AWS through OIDC (no stored AWS keys). |
| Domain registrar | Optional | Route 53 can register the domain, which keeps everything in AWS. |
| Claude | No | The MCP server is added as a custom connector on your existing plan. |
| USDA FoodData Central | Optional, free | API key for food lookups. Claude can also look foods up itself and pass nutrients to the API. |

**Everything runs on AWS.** No other cloud or SaaS vendor is required.

## 3. Repos

### 3a. Existing IaC repo (`aws_iac_mngr`, OpenTofu): new project root

The IaC repo uses **OpenTofu** (Terraform-compatible). Primary region is **us-east-2**. State lives in the shared `connor-ruff-terraform-state` bucket created by `admin_resources/bootstrap/`, so disci needs no new bootstrap, just its own state key. Everything that predates disci was moved into `controlled_resources/general/` (Oct 2026; every root re-planned with "No changes").

```
aws_iac_mngr/
├── admin_resources/                # one-time, account-level setup
│   ├── bootstrap/                  # state bucket + lock table (shared, unchanged)
│   ├── iam_identity_center/
│   └── github_oidc/                # (to add) GitHub OIDC provider: one per account, shared by any project's CI
└── controlled_resources/
    ├── general/                    # all pre-disci resources, one root per AWS service
    └── disci/                      # one root, ONE state: key = disci/terraform.tfstate
        ├── main.tf                 # backend; providers: us-east-2 + us-east-1 alias (CloudFront's ACM cert must be in us-east-1);
        │                           #   default_tags { project = "disci" }
        ├── variables.tf            # account_id, region, etc.
        ├── network.tf              # VPC, private subnets, security groups, EC2 Instance Connect Endpoint
        ├── database.tf             # RDS Postgres
        ├── auth.tf                 # Cognito user pool + app clients
        ├── compute.tf              # Lambdas (api, mcp, jobs, migrator), ECR
        ├── api.tf                  # API Gateway HTTP API, routes
        ├── frontend.tf             # S3 bucket + CloudFront
        ├── schedules.tf            # EventBridge Scheduler (reports, recurring generation)
        ├── email.tf                # SES identity
        ├── ci.tf                   # deploy role for this repo, trusting the shared GitHub OIDC provider
        ├── outputs.tf              # values written to SSM Parameter Store
        └── disci.md
```

Terraform owns the *slots*. Lambda resources use `lifecycle { ignore_changes = [image_uri] }` so app deploys aren't reverted by a later `terraform apply`.

### 3b. App repo (this repo, `disci`: monorepo)

Code is **segmented by module** at every layer. A module (finance, tasks, nutrition) has a folder in the API, a folder in the web app and its own Postgres schema, all with the same name. Shared plumbing lives in `core/` (API) and `app/` + `shared/` (web). Adding a module means adding those folders and registering the module in one place on each side.

```
disci/
├── compose.yaml                   # local Postgres + dbmate containers (see §3d)
├── Makefile                       # local dev commands: `make help` lists them
├── docs/                          # all documentation (see docs/docs-directory.md)
├── db/
│   ├── migrations/                # dbmate migrations (see §3d)
│   ├── seeds/
│   │   └── dev.sql                # fake data for local development (never run in prod)
│   ├── local/
│   │   └── roles.sql              # local-only `disci_api` login role (see §3d)
│   └── schema.sql                 # full current schema, auto-generated by dbmate (never edit)
├── api/                           # FastAPI on Lambda (see docs/api/api-overview.md)
│   ├── pyproject.toml / uv.lock   # uv-managed, Python 3.13
│   ├── app/
│   │   ├── main.py                # builds the app, mounts core routers + each module's router at /<key>
│   │   ├── core/                  # cross-module plumbing
│   │   │   ├── settings.py        # config from DISCI_* env vars
│   │   │   ├── auth.py            # request → identity (dev mode now; Cognito JWT later)
│   │   │   ├── db.py              # psycopg pool, per-request transaction, sets app.user_id
│   │   │   ├── sql.py             # loads queries/<name>.sql by name
│   │   │   ├── module.py          # Module: what a module registers (key, router, setup)
│   │   │   ├── users/             # GET/PUT /me
│   │   │   └── user_modules/      # GET /me/modules, PUT/DELETE /me/modules/{key}
│   │   └── modules/
│   │       ├── __init__.py        # MODULES registry
│   │       └── finance/           # stub today; a full module grows into:
│   │           ├── __init__.py    #   `module = Module(...)`
│   │           ├── router.py      #   HTTP routes (thin)
│   │           ├── schemas.py     #   Pydantic request/response models
│   │           ├── service.py     #   business rules (allocation checks, etc.)
│   │           └── queries/       #   one .sql file per query, loaded by name
│   └── tests/                     # pytest against the disci_test database
│       └── core/
├── web/                           # React + Vite + TS SPA, static build → S3 (see docs/ui/web-overview.md)
│   ├── package.json / package-lock.json
│   ├── vite.config.ts             # dev server :5173, proxies /api → localhost:8000
│   └── src/
│       ├── main.tsx               # QueryClient, module registry provider, router
│       ├── index.css              # Tailwind v4 + brand theme tokens (light/dark)
│       ├── app/                   # shell: top bar, module menu, router, MODULES registry, shell pages
│       ├── shared/
│       │   ├── api/               # typed openapi-fetch client, core query hooks,
│       │   │                      #   schema.d.ts (generated from the API, never edit)
│       │   ├── ui/                # shadcn-style components on radix-ui
│       │   └── lib/
│       └── modules/
│           └── finance/           # stub today; a full module grows into:
│               ├── index.ts       #   the module's manifest, added to MODULES
│               ├── routes.tsx     #   the module's route tree under /finance
│               ├── pages/
│               ├── components/    #   incl. its Home card
│               └── api.ts         #   TanStack Query hooks for this module
├── mcp/                           # (later) MCP server; calls the API
├── jobs/                          # (later) scheduled jobs: reports, recurring generation
└── .github/workflows/
    └── deploy.yml                 # build images → push ECR → update Lambdas
                                   # → run migrator → build web → sync S3 → invalidate CF
```

**SQL and injection safety** (plain SQL via psycopg 3, no ORM):
- Values are **always** bound parameters (`%(name)s`), never put into SQL with f-strings, `.format()` or `+`.
- Dynamic identifiers (e.g. a sort column) go through `psycopg.sql.Identifier` and are checked against an allow-list.
- Queries live in `.sql` files, so string-building SQL in Python is unusual and stands out in review. Ruff's `S608` rule flags it in CI.
- Row-level security (`app.user_id`) is the backstop: even a buggy query can't read another user's rows.

### 3c. Existing Snowflake repo

No changes for v1. Later it gets a `DISCI` database folder (raw tables, Snowpipe, reporting views).

### 3d. Environments, local development & migrations

There are **two environments: local (your laptop) and production (AWS).** No staging copy, which would roughly double the cost.

| | Local | Production |
|---|---|---|
| Postgres | Docker container with a **named volume**, so data survives restarts | RDS |
| API / web | Run on your machine (`make api` on :8000, `make web` on :5173; the web dev server proxies `/api` to the API) | Lambda / S3 + CloudFront |
| Login | **Dev auth** for now (`DISCI_AUTH_MODE=dev`: acts as the seeded user or the `X-Dev-User` header). Later, the same Cognito user pool with `localhost` as a callback URL | Cognito |
| Data | Fake data from `db/seeds/dev.sql` plus whatever you create while testing | Your real data |

**One-time setup:** install **Docker Desktop** and have it running, install **uv** (for the API) and **Node.js/npm** (for the web app), then run `make api-install` and `make web-install`. Postgres and dbmate both run in containers (defined in `compose.yaml`), so there's nothing else to install for the database.

**Local database lifecycle.** Stopping and starting the container keeps everything (data lives in the `disci-pgdata` Docker volume). The database is only wiped when you explicitly reset it:

| Command | What it does |
|---|---|
| `make help` | List the available commands (also what bare `make` does). |
| `make db-up` | Start Postgres. Existing data is still there. |
| `make db-down` | Stop Postgres. Data is kept. |
| `make db-migrate` | Create the local `disci_api` role if missing (`db/local/roles.sql`), apply any migrations that haven't run yet, and regenerate `db/schema.sql`. |
| `make db-rollback` | Roll back the most recent migration (runs its `migrate:down` section). |
| `make db-status` | Show which migrations have been applied. |
| `make db-new name=<module>__<desc>` | Create a new, empty migration file, e.g. `make db-new name=finance__create_budgets`. |
| `make db-seed` | Load the fake dev data. Safe to re-run. |
| `make db-reset` | Drop everything (including the volume), re-run all migrations from scratch, re-seed. Use it when you want a clean slate. |
| `make db-psql` | Open a `psql` shell on the local database. |

Commands that need the database start it first, so `make db-migrate` works from a cold start.

**API commands** (details in `docs/api/api-overview.md`):

| Command | What it does |
|---|---|
| `make api-install` | Install the API's Python dependencies (`uv sync`). |
| `make api` | Apply pending migrations, then run the API with auto-reload at http://localhost:8000 (interactive docs at `/docs`). |
| `make api-test` | Rebuild the separate `disci_test` database from the migrations, then run `pytest`. Your dev data is untouched. |
| `make api-lint` | Run ruff (lint + format check, including the `S608` SQL-injection rule). |

**Web commands** (details in `docs/ui/web-overview.md`):

| Command | What it does |
|---|---|
| `make web-install` | Install the web app's dependencies (`npm ci`, exact versions from `package-lock.json`). |
| `make web` | Run the web app with hot reload at http://localhost:5173. Needs `make api` running. |
| `make web-api-types` | Regenerate `web/src/shared/api/schema.d.ts` from the running API. |
| `make web-check` | Type-check and production-build the web app. |

**Running the app locally** takes two terminals: `make api` in one (starts Postgres, applies migrations, serves :8000), then `make web` in the other, and open http://localhost:5173. The browser calls `/api/...` on the Vite dev server, which forwards to the API, so there's no CORS setup.

`db-roles` and `db-test-prepare` are internal targets, run by `db-migrate` and `api-test`.

**Database roles locally.** `disci` owns the tables and runs migrations; as the owner it **bypasses row-level security**, so it's for psql and SQL clients only. The API connects as **`disci_api`** (password `disci_api`), a login role that is a member of `disci_app` and owns nothing, so RLS applies exactly as in production. It's created by `db/local/roles.sql`, which `make db-migrate` runs every time (idempotent). Production creates its own equivalent with RDS IAM auth and no password.

**Connecting a SQL client** (DBeaver, TablePlus, etc.) to the local database: host `localhost`, port `5432`, user `disci`, password `disci`, database `disci`. These credentials are local-only and not secret.

You never need to "create an account" locally. The API creates the `core.users` row on the first request (in dev auth mode, as `local-dev-user` or the `X-Dev-User` header's value), so even after a reset you just make a request. Once Cognito is wired up, signing in gives the same identity (`sub`) locally and in production.

**What keeps local and production in sync: schema yes, data no.**
- **Schema** is synced by the migration files. Both databases run the same files in the same order, and dbmate records which ones each database has applied (in a `schema_migrations` table).
- **Data is never synced.** Production data stays in production. If realistic data is ever wanted locally, that's a deliberate one-off export, not part of the workflow.

**Migrations (dbmate).**
- One folder, `db/migrations/`, applied in timestamp order. Files are named `<timestamp>_<module>__<description>.sql`, e.g. `20261026120000_finance__create_budgets.sql`, so it's obvious which module a migration belongs to.
- Each file has a `-- migrate:up` section and a `-- migrate:down` section. Create one with `make db-new`.
- dbmate runs in a container (`ghcr.io/amacneil/dbmate`, pinned in `compose.yaml`), not installed locally.
- **`db/schema.sql` is auto-generated** by dbmate after every migrate/rollback. It's a dump of the full current schema, committed so the current state can be read in one file instead of replaying every migration. **Never edit it by hand**; change the schema with a new migration.
- **Never edit a migration that has already run in production.** Fix it with a new migration.
- In production, the deploy pipeline invokes the `migrator` Lambda **before** shipping the new API code, so migrations must keep working with the currently deployed code (add columns first, remove old ones in a later release).

## 4. AWS services used

| Service | Role | Notes |
|---|---|---|
| RDS for PostgreSQL | Source of truth | db.t4g.micro, single-AZ, 20 GB gp3, private subnet |
| Lambda | api, mcp, jobs, migrator | Container images; in the VPC so they can reach RDS |
| API Gateway (HTTP API) | Public HTTPS entry point | HTTP API, not REST API (~3.5× cheaper) |
| Cognito | User accounts, OAuth for the MCP connector | Essentials/Lite tier |
| S3 + CloudFront | Hosts the static frontend | ACM certificate is free |
| EventBridge Scheduler | Morning/night reports, recurring-task generation | |
| SES | Sends report emails | |
| SSM Parameter Store | Config handoff from Terraform to the app | Standard parameters are free |
| ECR | Lambda container images | |
| CloudWatch Logs | Logs and basic alarms | |
| Route 53 | DNS (optional domain) | |
| AWS Budgets | Alert if spend exceeds ~$25/mo | First budgets are free |

### Networking decision (the main cost trap)

Lambdas run in the VPC's private subnets next to RDS, with **no NAT Gateway** (~$33/mo idle on its own). That works because:
- Lambdas only need to reach RDS. They authenticate with **RDS IAM auth**, whose tokens are signed locally, so there's no Secrets Manager call and no internet needed.
- Logs flow through the Lambda service itself, with no VPC endpoint required.
- Food lookups happen on the Claude side or in a separate non-VPC Lambda.
- **Migrations** run through a small `migrator` Lambda that CI invokes. No bastion is needed for deploys.
- **Ad-hoc SQL from your laptop**: an **EC2 Instance Connect Endpoint** in the VPC (no hourly charge) opens a tunnel from your laptop to RDS's private address (`aws ec2-instance-connect open-tunnel`, then `psql` against localhost). There's no bastion to run and RDS stays private. SSM port forwarding was ruled out because, without a NAT, it needs three interface endpoints (~$20+/mo). *Decided. Fallback if the endpoint proves awkward: a t4g.nano bastion started only when needed.*

## 5. Estimated monthly cost (single user)

| Item | Est. $/mo | Basis |
|---|---|---|
| RDS db.t4g.micro (compute) | ~$11.68 | $0.016/hr on-demand |
| RDS storage (20 GB gp3) | ~$2.30 | $0.115/GB-mo; backups up to DB size are free |
| Lambda | $0 | Always-free tier: 1M requests + 400K GB-s/mo |
| API Gateway HTTP API | ~$0.01 | $1.00 per million requests |
| Cognito | $0 | 10,000 MAU free (Lite/Essentials) |
| S3 + CloudFront | ~$0 | Well within free allowances |
| EventBridge Scheduler | $0 | 14M invocations/mo free |
| SES | ~$0.01 | ~60 emails/mo at $0.10 per 1,000 |
| ECR | ~$0.10 | ~1 GB of images |
| CloudWatch Logs | ~$0 | 5 GB/mo free |
| Route 53 hosted zone + domain | ~$1.50 | $0.50/mo zone + ~$12–15/yr domain (optional) |
| **Total** | **~$15–16/mo** | **~$12/mo with a 1-yr RDS reserved instance** |

**Costs this design deliberately avoids:**

| Thing | Cost if added | Why avoided |
|---|---|---|
| NAT Gateway | ~$33/mo + $0.045/GB | Not needed (see networking above) |
| Public IPv4 on anything | $3.60/mo per IP | RDS stays private |
| VPC interface endpoints | ~$7/mo each per AZ | IAM auth removes the need |
| REST API instead of HTTP API | 3.5× request cost | HTTP API is enough |
| Multi-AZ RDS | ~2× RDS cost | Not worth it for one user; nightly snapshots suffice |

**Watch item:** t4g instances run in "unlimited" CPU mode, so sustained high CPU accrues extra charges. That's unlikely at this scale, but a Budgets alert will catch it.

### If other users join later

Roughly flat until hundreds of active users: Lambda, API Gateway and Cognito stay at or near free, and RDS might step up to db.t4g.small (~$23/mo). Moving to Snowflake for reporting adds Snowflake credits, which mostly depend on how often loads and queries run.

## 6. Open questions to settle during build

1. **MCP auth with Cognito.** Cognito doesn't support OAuth dynamic client registration. Verify that Claude's custom connector setup accepts a pre-registered client ID/secret, or put a thin auth shim in front.
2. ~~Ad-hoc database access method~~. Decided: EC2 Instance Connect Endpoint (see networking above).
3. ~~Migration tool~~. Decided: dbmate (see §3d).
4. **Report delivery**: email via SES (deterministic, cheap) vs. Claude scheduled tasks (conversational), or both.
5. **Domain name.**