# Project Inspiration: Why Disci Exists

*Disci is short for "discipline". Companion to `disci-infrastructure.md`. This file tells the story: how life upkeep is tracked today, what works, what doesn't, and what the new app should be. Read it before designing anything. The infrastructure doc covers how; this one covers why and for whom.*

---

## 1. Who this is for

The builder is also the first (and for now, only) user. They have a computer science degree and work as a **data engineer**, so they're comfortable with SQL, data modeling, Terraform and AWS. They already run personal projects on:

- **AWS**, managed entirely through a **Terraform IaC repo** (nothing is created by hand in the console).
- **Snowflake**, with a repo of DDL files organized by database in a Liquibase-like layout, applied manually because full Liquibase is overkill for personal scale.

They value being **systematic**: they track things exhaustively and want the tracking to be reliable, low-friction, and theirs.

The app is for one person today but **should be architected so other people could sign up later**. That shapes the data model (every row belongs to a user) and auth (a real identity provider from day one), but it should not slow down v1.

---

## 2. How life upkeep is tracked today

There are three domains, each tracked differently.

### 2a. Finances

**EveryDollar (budgeting app)**
- The user defines **budget categories** in EveryDollar.
- They **log every single expense, every month, by hand**, and assign each one to a category. "Every item I purchase" is meant literally.
- **No bank connections.** All logging is manual, and that's by choice. The new app should not need bank sync any time soon.

**Google Sheet: bills checklist**
- A separate spreadsheet that works as a **monthly checklist of recurring bills**: what's due, when, and whether it's been paid.
- It exists because the checklist UI is better for *not forgetting* to pay something than EveryDollar's expense log is.
- **Pain point: bills are double-logged.** A paid bill gets checked off in the sheet *and* logged as an expense in EveryDollar.

### 2b. To-dos

**Google Sheet: task log** (recently created)
- Holds two different kinds of items in one place:
  - **Recurring / checklist-style tasks** on various cadences, e.g.:
    - Refill the Brita: **every night**
    - Wash bedsheets: **every 2 weeks**
  - **Ad-hoc, one-time tasks**, e.g. *book a flight for an upcoming wedding*. These are **removed from the sheet once complete**.

### 2c. Nutrition

**Google Sheet with two parts:**
- **Food repo**: a large, hand-maintained catalog of the **nutrition details of every grocery item the user buys**.
- **Daily log tab**: each day the user enters **foods and quantities eaten**, and **formulas look up each food in the repo** and add up the day's totals.
- The purpose is **hitting daily macro goals**.

### 2d. Instinct AI: the automation layer (to-dos and nutrition only)

The user already uses an AI assistant, **Instinct AI**, over text message to do much of the data entry:

- They text it naturally ("just had a banana, add it to food repo") and Instinct **updates the Google Sheets** for them. That includes adding new foods to the repo, logging what was eaten, and managing tasks.
- **The spreadsheets remain the official source of truth.** Instinct is just a convenient way to write to them.
- Instinct sends **two reports a day**:
  - **Morning**: what's coming up.
  - **Night**: what got crossed off that day (and what's still open).
- Instinct does **not** touch finances. EveryDollar and the bills sheet are fully manual.

### 2e. The user's own assessment

> The system **works** and is **decently automated**, but it's **disjointed**.

Concretely, the data is spread across one third-party app (EveryDollar) and three Google Sheets. Finances are double-logged, AI help covers only two of the three domains, and there's no single place to see everything.

---

## 3. The vision

**One "everything app" for life upkeep** that replaces EveryDollar, the bills checklist, the task sheet and the nutrition sheets. It has three ways in:

1. **Talk to Claude instead of Instinct.** An **MCP server** lets Claude read and write the app's data, so "hey, I had an apple" just gets logged. This should feel at least as easy as texting Instinct does today, across *all three* domains, finances included.
2. **Always-live dashboards** in a web app: today's macros vs. goals, budget vs. actual by category, bills due and paid, tasks due today.
3. **A really good manual input center** for when the user would rather enter things themselves. AI is a convenience, not a requirement; every action must be easy to do by hand.

Plus the **morning and night reports** that Instinct provides today.

Web app first. Mobile can come later; the web app should work well on a phone browser in the meantime.

---

## 4. Design principles that come out of the story

These follow directly from how the user works today. Treat them as requirements unless the user says otherwise.

1. **One source of truth.** The app's database replaces the spreadsheets and EveryDollar. Nothing should need to be entered twice.
2. **Kill the bills double-log.** *(Proposed. Confirm with the user.)* A recurring bill is a scheduled obligation. Marking it paid should **create the matching expense automatically** in the right budget category, so the checklist and the expense log become two views of the same data.
3. **Recurring and one-time tasks are both first-class.** Recurring tasks are **rules** (e.g. an iCal RRULE: daily, every 14 days) that **generate dated instances**. Checking off tonight's Brita refill completes one instance, not the rule.
4. **Complete, don't delete.** Today, finished ad-hoc tasks are removed from the sheet. In the app they should be **marked complete with a timestamp** (and deleted rows soft-deleted). The night report ("what I crossed off today") and future analytics depend on that history.
5. **The food repo is a catalog; the log references it.** Keep the spreadsheet's model: a reusable `foods` catalog with per-serving nutrition, and a daily log of *food + quantity + when*. Totals are **computed, never stored as the only record**.
6. **Store raw facts.** Log "150 g chicken breast," not just "38 g protein." Inputs can't be recovered from totals.
7. **AI is an interface, not the system.** Claude goes through the same API as the web UI, with the same validation. If Claude is unavailable, nothing breaks.
8. **Manual-first data entry.** No bank sync. Expense entry should be *fast* (smart defaults, recent categories and merchants, keyboard-friendly), since the user logs every purchase.
9. **Multi-user-ready, single-user-simple.** `user_id` on every table, row-level security, a real auth provider. But no admin consoles, billing or onboarding flows in v1.
10. **Analytics-friendly from day one.** UUID primary keys, `created_at` / `updated_at` on every table, soft deletes. That keeps a future Snowflake reporting layer easy (see the infra doc).

---

## 5. Decisions made so far

Discussed and agreed with the user; details are in `disci-infrastructure.md`.

| Decision | Choice | Why |
|---|---|---|
| App database | **Plain Postgres on RDS** | It's a transactional app workload. Snowflake is the wrong engine for per-row writes and interactive latency. |
| Snowflake | **Not in v1.** Added later as an analysis/reporting layer | Live dashboards are simple Postgres queries. Snowflake comes in when deeper, long-horizon analysis is wanted. |
| Cloud | **AWS only**, existing account | User's existing expertise and tooling. |
| Infra as code | **Existing IaC repo (`aws_iac_mngr`, OpenTofu)**, new `controlled_resources/disci/` root with **its own single state** and `default_tags { project = "disci" }`. Pre-existing resources moved to `controlled_resources/general/`. | Keeps all AWS infra in one place while staying isolated and easy to move to its own account later. |
| App code | **New monorepo**: `db/`, `api/`, `mcp/`, `jobs/`, `web/` | These pieces change together and share models. |
| Repo seam | Terraform owns infrastructure "slots"; app CI deploys code into them; values pass via **SSM Parameter Store** | Avoids Terraform and CI fighting over the same resources. |
| Schema management | **Versioned migrations in the app repo, using dbmate** (hand-written SQL up/down files) | An app schema evolves with live data, so it can't be dropped and recreated. |
| Bank connections | **None** | User logs manually by choice. |
| Budget | Keep it **~$15/mo**. Avoid NAT Gateways and public IPs | See the cost section of the infra doc. |
| App repo | **This repo (`disci`) is the monorepo**: `docs/` plus app code | One place for code and docs. |
| Build order | **Framework first, then finance.** Deploy a walking skeleton (infra, auth, user row, app shell with module nav) before features. Then a thin finance slice (budgets, categories, items, manual transactions), then recurring transactions and the bills checklist. | Shakes out infra and auth risk before feature code. Finance is the biggest current pain point. |
| Auth | **Cognito Hosted UI**, self-signup **off**: invite-only (users are created by tofu from an email list). The `core.users` row is created lazily on the first authenticated API request. | Simplest login. No Cognito trigger Lambda needed. |
| Domain | **CloudFront default domain** for v1 | A custom domain can come later. |
| Postgres | **Latest major version RDS offers (18)** | Native `uuidv7()`. |
| DB access from the API | **Plain SQL via psycopg 3**, no ORM. Queries are always parameterized. | Full visibility into SQL. See the infra doc for the injection-safety rules. |
| Frontend stack | **React + Vite + TypeScript**, TanStack Router, TanStack Query, Tailwind + shadcn/ui. API types are generated from FastAPI's OpenAPI spec. | Mainstream, well documented, type-safe end to end. |
| Code organization | **Segmented by module** everywhere: `api/app/modules/<module>/`, `web/src/modules/<module>/`, plus a Postgres schema per module | See the infra doc §3b. |
| Environments | **Local + production only.** Local Postgres runs in Docker with a persistent volume and fake seed data. Schema stays in sync through migrations. Data is never synced. | No staging copy, to keep cost ~$15/mo. See the infra doc §3d. |
| Modules are opt-in | Users **turn modules on** from a module menu (`core.user_modules`). Only enabled modules appear in navigation. | Avoids overwhelming new users. See `docs/ui/app-shell.md`. |
| Ad-hoc DB access | **EC2 Instance Connect Endpoint** tunnel to RDS (no bastion, no hourly cost). Fallback: an on-demand bastion. | Keeps RDS private and avoids the cost of SSM VPC endpoints, which a NAT-less VPC would need. |

---

## 6. What we don't know yet (ask, don't guess)

The exact structure of the current trackers hasn't been captured. Before finalizing the data model, **ask the user for**:

- **EveryDollar**: the list of budget categories (and any groups), and whether budgets are set per month or are fixed. Find out whether an export of historical expenses exists, and whether it should be migrated.
- **Bills sheet**: its columns (name, amount, due day, autopay?, account, etc.) and the current list of bills.
- **Task sheet**: its columns, how recurrence is expressed today, and the full set of current recurring tasks.
- **Nutrition sheet**: the food repo's columns (which nutrients, serving units, brand), how quantities are entered in the daily log (grams? servings?), and the **daily macro goals** (fixed, or varying by day).
- **Reports**: what exactly the morning and night reports should contain, and the delivery channel (email via SES, Claude scheduled tasks, or both).
- **Build order**: which domain to build first. Leaning toward **to-dos or nutrition**, since they already live in spreadsheets that can be migrated and they prove out the Claude/MCP loop before finances. User hasn't confirmed.

CSV exports of each Google Sheet would answer most of this at once, and would double as migration seed data.

---

## 7. Where we left off

Infrastructure and repo layout are agreed (see `disci-infrastructure.md`). **The next step is the data model**, starting with whichever domain the user picks first, guided by the principles in section 4 and the answers to section 6.

**Update:** a first-draft data model for all three modules now lives in `docs/db/` (start at `docs/db/db-overview.md`). Each module doc ends with its own open questions.