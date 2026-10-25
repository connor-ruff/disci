# Finance UI

*Status: **first slice implemented** (`web/src/modules/finance/`): budgets list, new budget, the budget page (items, transactions, logging) and categories. Recurring transactions, the bills checklist and the other items in §7 are not built yet.*

What the Finance screens look like and how they behave. The data model is in [finance.md](../db/finance.md), the endpoints in [api-overview.md](../api/api-overview.md) §7.1, and the shell around these pages in [app-shell.md](app-shell.md). Engineering conventions (hooks, query keys, `Sheet`, `Field`, money and date helpers) are in [web-overview.md](web-overview.md).

---

## 1. Routes and navigation

| Route | Page | Notes |
|---|---|---|
| `/finance` | (redirect) | Goes straight to `/finance/budgets`. |
| `/finance/budgets` | **Budgets** (`BudgetsPage`) | List of budgets, newest period first. Each card shows the name, an **Active** badge when today is in the budget's effective date range (§3.1), "Monthly / Weekly / Yearly" and the date range, and opens the budget. A **New** button in the header. With no budgets: an empty-state card with "Create a budget". |
| `/finance/budgets/new` | **New budget** (`NewBudgetPage`) | See §4.1. On success, navigates to the new budget. |
| `/finance/budgets/$budgetId` | **Budget** (`BudgetPage`) | See §2. |
| `/finance/categories` | **Categories** (`CategoriesPage`) | See §5. |

**Sub-nav tabs:** Budgets and Categories. Tabs match by URL prefix, so **Budgets stays active** on a budget page and on New budget.

**Home card** (`FinanceHomeCard`): links to `/finance/budgets` (budget-vs-actual summary on the card itself comes later).

---

## 2. Budget page layout

Top to bottom, in the centred single column:

```
October 2026
Oct 1 – Oct 31, 2026  (● Active)
┌──────────────────────────────────────────────┐
│  INCOME        SPENT          LEFT TO PLAN   │  ← summary card
│  $4,320.00     $2,108.52      $1,470.00      │
│  of $4,500.00  of $3,030.00   income − exp.  │
└──────────────────────────────────────────────┘
┌ Income ──────────────────────────────────────┐
│ SALARY                                       │  ← category group
│ Paycheck                $4,200.00 of $4,200  │
│ ████████████████████████████████████████     │  ← progress bar
│ UNCATEGORIZED                                │
│ Side gig                  $120.00 of $300    │
│ ███████████████                              │
│ [ + Add income ]                             │
└──────────────────────────────────────────────┘
┌ Expenses ────────────────────────────────────┐
│ HOUSING / FOOD / ... / UNCATEGORIZED         │
│ [ + Add expense ]                            │
└──────────────────────────────────────────────┘
┌ Transactions ────────────────────────────────┐
│ Kroger                              −$212.40 │
│ Groceries · Oct 8                       [🗑] │
└──────────────────────────────────────────────┘
            Delete budget
                                [ + Log transaction ]  ← floating button
```

- **Header:** the budget name and its effective date range, followed by the **Active** badge when today falls inside it (§3.1).
- **Summary card** (three columns): Income, Spent, Left to plan (§3).
- **Income** and **Expenses** cards. Items are grouped under their **category** heading in the API's order (category sort order, then name); **Uncategorized** is always last. Each card ends with an "Add income" / "Add expense" button, and shows a short prompt when it has no items.
- **Item rows** show the name, "**actual** of planned", and a progress bar of actual ÷ planned (capped at full; negative actuals show empty). For an **expense** item that is over plan, the actual amount and the bar turn **amber**. Income over plan is not flagged. Tapping a row opens the item sheet (§4.2).
- **Transactions card:** this budget's transactions, newest first, **one row per allocation** (a transaction split over two items in this budget would appear twice). Each row shows the payee (or the item name when there's no payee), the item and date, and the **allocated** amount with `+` for income (teal) or `−` for expense. A trash button deletes the transaction after a confirm (it's removed from every budget).
- **Delete budget** (red, at the bottom): confirms, soft-deletes the budget and its items, and returns to the list. Its transactions are kept but become unassigned.
- **"Log transaction"** is a floating pill button fixed at the bottom-right (above the safe-area inset), within thumb reach on phones. It opens the transaction sheet with no item preselected.

---

## 3. What each number means

| Number | Meaning |
|---|---|
| Item **actual** | Net of the transactions allocated to the item: transactions of the item's kind **add**, the opposite kind **subtracts** (a $25 grocery rebate logged as income on Groceries lowers its actual). Can be negative. Comes from the API (`actual_amount`). |
| Item **planned** | The item's `planned_amount`. |
| **Income** (summary) | Sum of income items' actuals, "of" the sum of their planned amounts. |
| **Spent** (summary) | Sum of expense items' actuals, "of" the sum of their planned amounts. |
| **Left to plan** | **Planned income − planned expenses.** How much income hasn't been given a job yet (zero-based budgeting). Uses planned amounts only, not actuals. Shown in amber when negative (more planned spending than planned income). |

Transactions that aren't allocated to any item in this budget don't count toward any of these numbers.

### 3.1 Effective date range and "Active"

A budget's **effective date range** is `period_start`..`period_end`, **inclusive**: a month runs from the 1st to the last day, a week is 7 days from the user's week-start day (Settings), a year is Jan 1 to Dec 31. It's the date range shown under the budget's name.

A budget is **active** when today, **in the user's timezone** (`core.users.timezone`, falling back to the browser's), falls inside that range. Active budgets get an **"Active" pill with a small teal dot** on the budgets list and in the budget page header; inactive ones show nothing. It's computed client-side (`useIsActive` in `components/ActiveBadge.tsx`, comparing ISO date strings); there's no API field for it. Overlapping budgets (a monthly and a yearly one, or two for the same month) can all be active at once.

---

## 4. Forms

All add/edit forms open in a **`Sheet`**: a bottom sheet on phones, a centred dialog on wider screens. They use native inputs (`type="date"`, `<select>`, `inputMode="decimal"` for amounts) so phones show their own pickers. Amounts accept `12`, `12.5`, `$1,250.00`; anything else shows "Enter an amount like …". API errors are shown under the form via `errorMessage`.

### 4.1 New budget (a page, not a sheet)

| Field | Behaviour |
|---|---|
| Covers | Segmented: **A month** (default) / A week / A year. |
| Month | Two selects, **Month** and **Year** (last year through two years ahead), not `type="month"`: desktop Safari renders that as a free-text field. Suggests the **month after the latest monthly budget**, unless that's in the past, in which case the current month (in the user's timezone). |
| Any day in the week | `type="date"`, defaults to today. Hint: weeks start on the day set in Settings (the API snaps to that start). |
| Year | Select of last year through two years ahead. |
| Start from | Select: **Blank budget** plus the user's budgets of the **same type**. Defaults to the most recent one of that type (blank if there are none) and re-defaults when Covers changes. Sent as `copy_from_budget_id`: the new budget gets copies of the source's items, categories and planned amounts; transactions are not copied (the hint says so). |
| Name (optional) | Blank → the API names it after the period ("October 2026", "2026", "Week of Oct 19, 2026"). Use a name for a second budget in the same period (e.g. "October – Vacation"). |

### 4.2 Item sheet (`ItemSheet`)

Opened by "Add income" / "Add expense" (new item of that kind) or by tapping an item row (edit). Title: "Add income" / "Add expense", or the item's name.

| Field | Behaviour |
|---|---|
| Name | Required. |
| Planned amount | Blank counts as 0. |
| Category | Select of **only that kind's** categories, plus **Uncategorized** (the default). |

Buttons: **Add** / **Save**; when editing, also **Log transaction** (closes this sheet and opens the transaction sheet with this item preselected) and **Delete item** (confirms: "Its transactions stay but won't count toward this budget"). An item's kind can't be changed.

### 4.3 Transaction sheet (`TransactionSheet`)

| Field | Behaviour |
|---|---|
| Type | Segmented **Expense** / **Income**. Defaults to the preselected item's kind, else Expense. |
| Amount | Autofocused, large text. Must be more than 0. |
| Budget item | Optional select, grouped into Income and Expenses optgroups, listing this budget's items; "Don't assign yet" leaves it unassigned. When the type is **opposite** to the item's kind, a hint says it **counts as a credit** against that item (e.g. a refund or rebate). |
| Date | `type="date"`, defaults to **today in the user's timezone** (`todayIn(me.timezone)`). |
| Payee (optional) | Free text, e.g. "Kroger" / "Employer". |

On save it creates one allocation for the **full amount** to the chosen item (or none), and refreshes every budget.

---

## 5. Categories page

Two cards, **Expenses** then **Income**. Each lists its categories with **rename** (inline edit with save / cancel) and **delete** (confirms; items in it become Uncategorized), and ends with an "Add a category" input. A duplicate name in the same kind shows the API's "already exists" error under the card. Default expense categories are created when Finance is first turned on; there are no default income categories.

---

## 6. Data and caching

Hooks live in `web/src/modules/finance/api.ts`; query keys are in `financeKeys` (`['finance', 'categories']`, `['finance', 'budgets']`, `['finance', 'budget', id]`, `['finance', 'budget', id, 'transactions']`).

| Mutation | Cache update |
|---|---|
| Create / update / delete **item** | The API returns the updated `BudgetDetail`, which is **written straight into** `['finance', 'budget', id]` (no refetch). Delete also invalidates that budget's transactions. |
| Create / delete **transaction** | Invalidates **all** `['finance', 'budget', ...]` queries, since a transaction can count toward several budgets. |
| Create / delete **budget** | Invalidates the budgets list. |
| Create category | Invalidates categories. |
| Rename / delete category | Invalidates everything under `['finance']` (budgets show category names). |

---

## 7. Not built yet

The API or data model already supports some of these; the UI doesn't yet.

- **Splitting** a transaction across several items (the API accepts several allocations).
- **Allocating one transaction to more than one budget** from the UI (the API allows it, e.g. a monthly and a yearly budget).
- **Editing transactions** (only create and delete exist; no API endpoint for edit yet).
- **Unassigned ("needs assignment") inbox** for transactions with no allocations.
- **Renaming a budget / editing notes** in the UI (the API has `PUT /finance/budgets/{id}`).
- **Recurring transactions and the bills checklist** (pending/confirmed status).
- A budget-vs-actual summary on the Finance **Home card**.
