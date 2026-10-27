# Finance UI

*Status: **implemented** (`web/src/modules/finance/`): budgets list, new budget, the budget page (items, transactions, logging, reorder mode), categories (with descriptions and reordering), and the second slice: the monthly **Checklist**, **Recurring** transactions and the **Inbox** (approvals and unassigned transactions). Transactions open in a view with **Edit** and **Delete**. What's still missing is in §10.*

What the Finance screens look like and how they behave. The data model is in [finance.md](../db/finance.md), the endpoints in [api-overview.md](../api/api-overview.md) §7.1, and the shell around these pages in [app-shell.md](app-shell.md). Engineering conventions (hooks, query keys, `Sheet`, `Field`, `Checkbox`, `SortableList`, money and date helpers) are in [web-overview.md](web-overview.md).

---

## 1. Routes and navigation

| Route | Page | Notes |
|---|---|---|
| `/finance` | (redirect) | Goes straight to `/finance/budgets`. |
| `/finance/budgets` | **Budgets** (`BudgetsPage`) | List of budgets, newest period first. Each card shows the name, an **Active** badge when today is in the budget's effective date range (§3.1), "Monthly / Weekly / Yearly" and the date range, and opens the budget. A **New** button in the header. With no budgets: an empty-state card with "Create a budget". |
| `/finance/budgets/new` | **New budget** (`NewBudgetPage`) | See §4.1. On success, navigates to the new budget. |
| `/finance/budgets/$budgetId` | **Budget** (`BudgetPage`) | See §2. |
| `/finance/checklist` | **Checklist** (`ChecklistPage`) | See §6. |
| `/finance/recurring` | **Recurring** (`RecurringPage`) | See §7. |
| `/finance/inbox` | **Inbox** (`InboxPage`) | See §8. |
| `/finance/categories` | **Categories** (`CategoriesPage`) | See §5. |

**Sub-nav tabs:** Budgets, Checklist, Recurring, Inbox, Categories. Tabs match by URL prefix, so **Budgets stays active** on a budget page and on New budget.

**Home card** (`FinanceHomeCard`, built on the shared `ModuleCard` / `Meter`): finds the most recent **monthly** budget whose dates include today (in the user's timezone) and links straight to it (`/finance/budgets/<id>`). It shows the budget name, the **% of budget spent** (expense actual ÷ expense planned) in large type, a meter (amber when over) and "$spent of $planned · $left left", or "· $X over" in amber when over. If nothing is planned for expenses it shows the spent amount and "spent, nothing budgeted". With **no active monthly budget** the subtitle reads "No budget for this month yet" and the card links to `/finance/budgets`.

---

## 2. Budget page layout

Top to bottom, in the centred single column:

```
October 2026                                   [ ⇅ Reorder ]
Oct 1 – Oct 31, 2026  (● Active)
┌──────────────────────────────────────────────┐
│ 📥 2 recurring transactions need your approval  Review │  ← only when approvals are pending
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ [Spent vs budget|Budget surplus|True surplus]│  ← KPI card: small segmented toggle
│  ╭─────────╮ SPENT VS BUDGET                 │
│  │   70%   │ $2,108.52                       │  ← ring meter + hero number
│  │of budget│ of $3,030.00 budgeted expenses  │
│  ╰─────────╯ $921.48 left to spend           │  ← footnote
└──────────────────────────────────────────────┘
┌ Income ────────────── $4,320.00 of $4,500.00 ┐  ← side total
│ SALARY                $4,200.00 of $4,200.00 │  ← category group + its total
│ Paycheck                $4,200.00 of $4,200  │
│ ████████████████████████████████████████     │  ← progress bar
│ UNCATEGORIZED             $120.00 of $300.00 │
│ Side gig                  $120.00 of $300    │
│ ███████████████                              │
│ [ + Add income ]                             │
└──────────────────────────────────────────────┘
┌ Expenses ──────────── $2,108.52 of $3,030.00 ┐
│ HOUSING                   $0.00 of $1,800.00 │
│ Rent                     $0.00 of $1,800     │
│ (empty bar)                                  │
│ 🕒 Due 1st                                   │  ← checklist indicator (under the bar)
│ UTILITIES                  $96.10 of $180.00 │
│ Electric                $96.10 of $110       │
│ █████████████████████████████████████        │
│ ✓ Checklist done                             │
│ Internet                 $0.00 of $70        │
│ (empty bar)                                  │
│ 🕒 Due 15th   $70.00 awaiting approval       │  ← same line as pending amount
│ [ + Add expense ]                            │
└──────────────────────────────────────────────┘
┌ Transactions ────────────────────────────────┐
│ Kroger                            −$212.40 › │  ← row opens the transaction view
│ Groceries · Oct 8 · weekly shop              │
└──────────────────────────────────────────────┘
            Delete budget
                                [ + Log transaction ]  ← floating button
```

- **Header:** the budget name and its effective date range, followed by the **Active** badge when today falls inside it (§3.1). On the right, the **Reorder** button (§2.1).
- **Pending banner** (amber): shown when any transactions in the user's inbox await approval ("N recurring transactions need your approval"). Tapping it opens the Inbox. It counts all pending transactions, not just this budget's.
- **KPI card** (`BudgetKpis`): a small segmented toggle (`Segmented` with `size="sm"`) with, in order, **Spent vs budget**, **Budget surplus** and **True surplus** (definitions in §3). One KPI is shown at a time: a **donut ring meter** on the left with the percentage and a short caption ("of budget" / "of income") in the middle, and on the right the KPI's title, a **hero number**, a detail line (how it's worked out) and a footnote.
  - The title switches to "Budget deficit" / "True deficit" when the number is negative.
  - Negative or over-budget results show **amber** (ring, number and footnote), always alongside words ("deficit", "over budget"), never color alone.
  - The ring fills with its ratio, **capped at full**; it shows "—" when there's nothing to compare against (the denominator is 0).
  - The chosen KPI is **remembered per device** in `localStorage` (`disci.finance.kpi`), falling back to Spent vs budget when nothing is stored or storage is unavailable.
- **Income** and **Expenses** cards. Items are grouped under their **category** heading in the API's order (the user's category order, then item order within each category); **Uncategorized** is always last. Each card ends with an "Add income" / "Add expense" button, and shows a short prompt when it has no items.
  - **Totals**: each card title shows that side's total on the right ("$actual of $planned", `text-sm`, muted), and each category heading shows its group's total the same way in small `text-xs`. On the expense side, a total over plan shows its actual in **amber**. Totals are hidden in reorder mode.
- **Item rows** show the name, "**actual** of planned", and a progress bar of actual ÷ planned (capped at full; negative actuals show empty). For an **expense** item that is over plan, the actual amount and the bar turn **amber**. Income over plan is not flagged. Tapping a row opens the item sheet (§4.2).
  - The name gets the full row width (it truncates only if it would collide with the amount), so long item names aren't cut off by the checklist indicator.
  - A small muted line **under the progress bar** (`text-xs`) holds two optional notes side by side, wrapping if needed:
    - **Checklist indicator** on checklist items: "Due 5th" (clock icon) until its confirmed actual reaches the planned amount (`checklist_done`), then "Checklist done" (teal check).
    - **"$X awaiting approval"** (amber) when pending transactions are allocated to the item. They don't count in the actual yet.
- **Transactions card:** this budget's transactions, newest first, **one row per allocation** (a transaction split over two items in this budget would appear twice). Each row shows the payee (or the item name when there's no payee), the item, date and notes, and the **allocated** amount with `+` for income (teal) or `−` for expense. Pending transactions get a **Pending** tag and a muted amount. Each row is a button with a chevron that opens the **transaction view** (§4.5), where it can be edited or deleted. The list is the shared `TransactionList` component (also used for an item's transactions, §4.2).
- **Delete budget** (red, at the bottom): confirms, soft-deletes the budget and its items, and returns to the list. Its transactions are kept but become unassigned.
- **"Log transaction"** is a floating pill button (`h-12`, `px-4`) fixed at the bottom-right (above the safe-area inset), within thumb reach on phones. It opens the transaction sheet with no item preselected.

### 2.1 Reorder mode

**Reorder** (outline button, `ReorderToggle`) switches the page into drag-to-reorder mode; it becomes a filled **Done** button that switches back. While reordering, the KPI card, the category and side totals, transactions, delete button, add buttons and floating button are hidden, and rows show just the name and planned amount.

- Each **category group** has a grip handle: dragging groups reorders the user's **global** category order for that kind (it applies to every budget and the Categories page). The new order sent is the categories shown in this budget in their new order, followed by the user's other categories of that kind in their existing order. Uncategorized has no handle and stays last.
- Each **item** has a grip handle and can be dragged **within its category group**. Item order is **per budget** (copied when the budget is copied).
- Dragging uses `SortableList` (@dnd-kit): touch (press and hold briefly), mouse, or keyboard (focus a handle, Space, arrows, Space). Each drop saves to the API immediately, and the list updates optimistically before the response arrives.

---

## 3. What each number means

| Number | Meaning |
|---|---|
| Item **actual** | Net of the **confirmed** transactions allocated to the item: transactions of the item's kind **add**, the opposite kind **subtracts** (a $25 grocery rebate logged as income on Groceries lowers its actual). Can be negative. Comes from the API (`actual_amount`). Pending transactions are excluded and shown separately as "awaiting approval" (`pending_amount`). |
| Item **planned** | The item's `planned_amount`. |
| **Spent vs budget** (KPI) | Sum of expense items' actuals ("spent"), "of" the sum of their planned amounts (planned expenses). Ring: spent ÷ planned expenses, "of budget". Footnote: "$X left to spend", or "$X over budget" in **amber** once spent passes the plan. |
| **Budget surplus / deficit** (KPI) | **Planned income − planned expenses.** (Previously labelled "Left to plan".) Positive: income not yet given a job (zero-based budgeting). Negative: more planned spending than planned income, shown in **amber** as "Budget deficit". Uses planned amounts only, not actuals. Ring: planned expenses ÷ planned income, "of income". |
| **True surplus / deficit** (KPI) | **Planned income − actual spent** (expense actuals). Positive: planned income not spent yet. Negative: spending is past planned income, shown in **amber** as "True deficit". Ring: spent ÷ planned income, "of income". |
| **Category / side totals** | Sum of the group's (or side's) item actuals, "of" the sum of their planned amounts. An expense total whose actual is over its planned shows the actual in **amber**. |

Transactions that aren't allocated to any item in this budget don't count toward any of these numbers.

### 3.1 Effective date range and "Active"

A budget's **effective date range** is `period_start`..`period_end`, **inclusive**: a month runs from the 1st to the last day, a week is 7 days from the user's week-start day (Settings), a year is Jan 1 to Dec 31. It's the date range shown under the budget's name.

A budget is **active** when today, **in the user's timezone** (`core.users.timezone`, falling back to the browser's), falls inside that range. Active budgets get an **"Active" pill with a small teal dot** on the budgets list and in the budget page header; inactive ones show nothing. It's computed client-side (`useIsActive` in `components/ActiveBadge.tsx`, comparing ISO date strings); there's no API field for it. Overlapping budgets (a monthly and a yearly one, or two for the same month) can all be active at once.

---

## 4. Forms

All add/edit forms open in a **`Sheet`**: a bottom sheet on phones, a centred dialog on wider screens. They use native inputs (`type="date"`, `<select>`, `inputMode="decimal"` for amounts) so phones show their own pickers, and the shared `Checkbox` for yes/no options. Amounts accept `12`, `12.5`, `$1,250.00`; anything else shows "Enter an amount like …". API errors are shown under the form via `errorMessage`.

### 4.1 New budget (a page, not a sheet)

| Field | Behaviour |
|---|---|
| Covers | Segmented: **A month** (default) / A week / A year. |
| Month | Two selects, **Month** and **Year** (last year through two years ahead), not `type="month"`: desktop Safari renders that as a free-text field. Suggests the **month after the latest monthly budget**, unless that's in the past, in which case the current month (in the user's timezone). |
| Any day in the week | `type="date"`, defaults to today. Hint: weeks start on the day set in Settings (the API snaps to that start). |
| Year | Select of last year through two years ahead. |
| Start from | Select: **Blank budget** plus the user's budgets of the **same type**. Defaults to the most recent one of that type (blank if there are none) and re-defaults when Covers changes. Sent as `copy_from_budget_id`: the new budget gets copies of the source's items, categories, planned amounts, item order and checklist settings; transactions are not copied (the hint says so). |
| Name (optional) | Blank → the API names it after the period ("October 2026", "2026", "Week of Oct 19, 2026"). Use a name for a second budget in the same period (e.g. "October – Vacation"). |

### 4.2 Item sheet (`ItemSheet`)

Opened by "Add income" / "Add expense" (new item of that kind, straight to the form below) or by tapping an item row, which opens the item's **view**. The page looks the open item up by id in the budget data, so the sheet always shows fresh numbers (e.g. after logging a transaction).

**View** (title: the item's name):

- **Progress**: the actual, large, then "spent" (expense) or "received" (income) "of $planned", a progress bar (amber with an amber actual when an expense is over plan), and "$X awaiting approval" (amber) when pending transactions are allocated to it.
- **Facts list**: Name, Planned amount, Category (or Uncategorized) and, in **monthly budgets only**, Monthly checklist: "Due the Nth" with a teal check (plus "· done") or a clock icon, or "Not on the checklist".
- Three buttons side by side, icon over label, in order: **Edit**, **View transactions**, **Log transaction** (primary). Below them, **Delete item** (red; confirms: "Its transactions stay but won't count toward this budget").
  - **Edit** switches to the form (title "Edit <name>") with **Save** and **Cancel**; both return to the view.
  - **View transactions** (title "<name> transactions") shows a "Back to <name>" link and the item's rows from the budget's transactions (`TransactionList`, filtered client-side by `budget_item_id`, item name hidden), or "Nothing logged to <name> yet." Tapping a row opens the transaction view (§4.5) **on top** of the item sheet.
  - **Log transaction** opens the transaction sheet (§4.3) with this item preselected, **on top** of the item sheet (it no longer closes it); closing it returns to the item.
- Closing the sheet resets it to the view for next time.

**Form** (new item, or Edit):

| Field | Behaviour |
|---|---|
| Name | Required. |
| Planned amount | Blank counts as 0. |
| Category | Select of **only that kind's** categories, plus **Uncategorized** (the default). |
| On the monthly checklist | Checkbox, **monthly budgets only** (hidden otherwise; the API rejects it elsewhere). It shows on the Checklist tab and is done once what's been paid reaches the planned amount (§6). |
| Due on day | Shown when the checkbox is on: select of the 1st–28th. |

Buttons: **Add** (closes the sheet) / **Save** (returns to the view); when editing, also **Cancel**. An item's kind can't be changed.

### 4.3 Transaction sheet (`TransactionSheet`)

Takes a required `budget` prop (the budget being logged into: `id`, `name`, `period_start`, `period_end`) and an optional `title` (default "Log transaction"). The form inside (`TransactionForm`) is also used to **edit** a transaction from the transaction view (§4.5); differences when editing are noted there.

- **"Logging to" box** at the top: the budget's name and date range, so it's always clear which budget is affected.
- When the selected item is a **checklist item**, the box also shows "Checklist item <name>, due the <Nth> (<date>).", followed by "Paid $X of $Y; done once it reaches the plan." while it's open, or "Already done." once its actual has reached the plan.
- **From the Checklist page** (§6) the sheet is titled **"Check off <item>"**.
- Opened on an **open** (not yet done) checklist item, from the Checklist page or an item's Log transaction button, the **amount is pre-filled** with what's left (planned − actual), when that's more than 0.

| Field | Behaviour |
|---|---|
| Type | Segmented **Expense** / **Income**. Defaults to the preselected item's kind, else Expense. |
| Amount | Large text. Must be more than 0. Pre-filled with what's left (planned − actual) when paying an open checklist item. |
| Budget item | Optional select, grouped into Income and Expenses optgroups, listing this budget's items; "Don't assign yet" leaves it unassigned. When the type is **opposite** to the item's kind, a hint says it **counts as a credit** against that item (e.g. a refund or rebate). |
| Date | `type="date"`, defaults to **today in the user's timezone** (`todayIn(me.timezone)`). |
| Payee (optional) | Free text, e.g. "Kroger" / "Employer". |
| Notes (optional) | Multi-line text, up to 1,000 characters. Shown in the budget's transaction list and the Inbox. |

On save it creates one confirmed allocation for the **full amount** to the chosen item (or none), and refreshes everything under Finance (budgets, inbox, checklist).

### 4.5 Transaction view (`TransactionDetailSheet`)

Opened by tapping a transaction row, on the budget page or in an item's transactions (§4.2). It loads the transaction with `GET /finance/transactions/{id}` (title "Transaction").

- The **signed amount**, large (`+` teal for income, `−` for expense), then the kind and a **Pending approval** tag when pending.
- **Facts list**: **Date**; **Payee** (or "None"); **Counts toward**: each allocation as "<item> · <budget>", with its amount when it's only part of the transaction, or "No budget item (it's in the Inbox)" when there are none; **Source** ("Created by a recurring transaction") when a rule created it.
- **Notes**, when it has any.
- Buttons: **Edit** and **Delete transaction** (red; confirms "It is removed from every budget", then closes).

**Edit** (title "Edit transaction") reuses the transaction form (§4.3), pre-filled from the transaction, with **Save** and **Cancel**; both return to the view.

- The box at the top reads **"In budget"** (the budget it was opened from) instead of "Logging to". If the transaction also counts in **other budgets**, a note lists them ("Also counts in 2026 (Gas). A new amount applies there too.").
- The Budget item select lists this budget's items, pre-selected with the item it counts toward here.
- On save (`PUT /finance/transactions/{id}`, the whole transaction): its allocation(s) **in this budget** are replaced by one full-amount allocation to the chosen item (or none). Allocations in **other budgets** are kept: set to the new amount when they were the full old amount or would exceed the new amount, otherwise left as they were. The `description` is preserved.
- Caveat: a transaction **split** over several items in this budget collapses to the one chosen item when edited.
- A **pending** transaction stays pending when edited (status doesn't change); approve it in the Inbox.

### 4.4 Recurring sheet (`RecurringSheet`)

Opened by **New** on the Recurring page, or by tapping a rule (edit; title = the rule's name).

| Field | Behaviour |
|---|---|
| Type | Segmented **Expense** / **Income**. Changing it clears the category. |
| Name | Required. Hint: counts toward the budget item with this name. Offers **suggestions** through a native `<datalist>`: the existing item names of the rule's type from the **monthly budget(s) covering today**, or, if there are none, the **most recent monthly budget** (`useItemNameSuggestions` in `api.ts`). Picking one makes the rule match that item exactly (matching is a case-insensitive exact name match); a name that matches nothing, with auto-apply on, creates a new item. Free text is still allowed. |
| Amount / Category | Side by side. Category lists only that type's categories, plus Uncategorized. |
| Repeats | Segmented **Monthly** (default) / Weekly / Quarterly / Yearly. |
| On day | Monthly: select of "1st of each month" … "28th of each month". |
| Every | Weekly: select of Monday … Sunday. |
| Starting / First date | `type="date"`, defaults to today. Labelled **First date** for quarterly and yearly, which repeat from it; a hint shows the later dates ("Then May 10, Aug 10 and Nov 10 each year" / "Every year on Feb 10"). Quarterly rejects a day after the 28th with a message before sending. |
| Ends (optional) | `type="date"`, not before the start. |
| Automatically apply to all budgets | Checkbox, **on by default**. Counts it in every budget whose dates include it, under the item with this name (added if missing). Off: it lands in the Inbox to assign. |
| Requires approval | Checkbox, off by default. Waits in the Inbox until approved (amount adjustable); otherwise logged right away. |
| Paused | Checkbox, when editing only. Creates nothing while paused. |
| Payee / Notes (optional) | Copied onto each transaction it creates. |

Buttons: **Create** / **Save**; when editing, also **Delete recurring transaction** (confirms; transactions it already created are kept). Saving creates anything due today right away.

There is no checklist option on a rule. A rule's payment (e.g. an autopay bill with auto-apply on) completes a checklist item the same way any payment does: by bringing the item's actual up to its planned amount.

---

## 5. Categories page

A **Reorder** / **Done** button in the header, then two cards, **Expenses** then **Income**.

- Each card lists its categories in the user's order, each with its **description** (muted, one line) when it has one.
- **Edit** (inline, with save / cancel): name and an optional **description**.
- **Delete** (confirms): items in it become Uncategorized.
- Each card ends with an "Add a category" input and an optional "Description (optional)" input.
- A duplicate name in the same kind shows the API's "already exists" error under the card.
- **Reorder mode** swaps each list for a `SortableList` with grip handles (no edit, delete or add while reordering). Each drop saves the new order for that kind; it's the same global order the budget page uses.

Default expense categories are created when Finance is first turned on; there are no default income categories.

---

## 6. Checklist page

This month's bills and must-dos: the checklist items from the **monthly budget(s) covering today** (user's timezone), ordered by due day. The header says "N of M done this month".

An item is **done** once its confirmed net actual reaches its planned amount and is more than 0 (so a $0-planned item needs something logged). Pending transactions don't count, and opposite-kind credits net, so a refund can un-tick an item.

- **Done** items: teal check, struck-through name, "Done Oct 3" (`last_payment_on`, the date of the latest confirmed payment). Not tappable.
- **Overdue** items (not done, due date before today): **amber** icon and "Overdue · was due Oct 1".
- **Upcoming** items: muted dashed circle and "Due Oct 15".
- Open items with something paid add " · paid $X so far" (e.g. "Due Oct 15 · paid $800.00 so far").
- Each row shows the item's planned amount. If more than one monthly budget covers this month, rows also show their budget's name.
- **Tapping an open item** opens the transaction sheet (§4.3), titled "Check off <item>", logging to that item's budget, with the item preselected, the amount pre-filled with what's left (planned − actual), so logging the payment ticks it off.
- Empty state: explains how to add one (open an item in this month's budget and turn on "On the monthly checklist").

---

## 7. Recurring page

A **New** button in the header, then one card per rule (income first, then by name; paused rules are dimmed). Each card shows:

- The name and the amount (`+` teal for income, `−` for expense).
- The schedule ("Monthly on the 12th", "Every Monday", "Quarterly from Feb 10", "Yearly on Feb 10"), then **Next Oct 30** (`next_occurrence`) or **Paused**.
- Chips: the category, **Applies to budgets** or **Goes to Inbox** and **Needs approval**.

Tapping a card opens the recurring sheet (§4.4). Empty state: "Nothing recurring yet".

Each rule creates its transaction **on its date** (the hourly job, or right away when saved if it's due today). It never backfills dates from before the rule was created.

---

## 8. Inbox page

Transactions that need a decision. Empty state: "All caught up".

- **Needs approval** card (pending transactions from rules that require approval, oldest first). Each row shows the rule's name (or payee), amount, date and notes, with an **editable amount** (pre-filled with the expected one), **Approve** (confirms it, with the corrected amount if changed) and a reject (✕) button that confirms first ("It won't be logged"); a rejected occurrence never comes back.
- **Not in a budget** card (confirmed transactions not counted toward any budget item, newest first), each with an **Assign** button. Assign opens a sheet:
  - **Budget**: defaults to a budget whose dates cover the transaction's date (else the first one).
  - **Budget item**: grouped Income / Expenses; guessed as the item named like the recurring rule, else the first item of the same kind.
  - **Assign** allocates the full amount to that item (`PUT /finance/transactions/{id}/allocations`).

---

## 9. Data and caching

Hooks live in `web/src/modules/finance/api.ts`; query keys are in `financeKeys` (`['finance', 'categories']`, `['finance', 'budgets']`, `['finance', 'budget', id]`, `['finance', 'budget', id, 'transactions']`, `['finance', 'transaction', id]` (one transaction with its allocations, for the transaction view), `['finance', 'inbox']`, `['finance', 'recurring']`, `['finance', 'checklist']`).

| Mutation | Cache update |
|---|---|
| Create / update / delete **item** | The API returns the updated `BudgetDetail`, which is **written straight into** `['finance', 'budget', id]` (no refetch). Create/update also invalidate the checklist; delete invalidates that budget's transactions. |
| Reorder **items** | **Optimistic**: the budget's items are re-sorted in the cache immediately; the returned `BudgetDetail` then replaces it. |
| Reorder **categories** | **Optimistic**: `sort_order` is updated in the categories cache immediately; the returned list replaces it, and every `['finance', 'budget', ...]` query is invalidated (budgets group by category order). |
| Create / update / delete **transaction**, approve, reject, assign, save / delete **recurring rule** | Invalidate everything under `['finance']`: a transaction can count toward several budgets and affects the inbox and checklist, and saving a rule can create transactions. |
| Create / delete **budget** | Invalidates the budgets list. |
| Create category | Invalidates categories. |
| Edit / delete category | Invalidates everything under `['finance']` (budgets show category names). |

---

## 10. Not built yet

The API or data model already supports some of these; the UI doesn't yet.

- **Splitting** a transaction across several items, and **allocating one transaction to more than one budget** from the UI (the API accepts several allocations, e.g. a monthly and a yearly budget). Inbox Assign and the transaction form write one allocation in the budget at hand (editing keeps allocations in other budgets, §4.5).
- **Renaming a budget / editing notes** in the UI (the API has `PUT /finance/budgets/{id}`).
