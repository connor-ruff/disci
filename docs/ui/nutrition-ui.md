# Nutrition UI

*Status: **implemented** (`web/src/modules/nutrition/`): the **Daily** food sheet (and the same sheet for any past day), **History**, the **Food repo**, **Goals**, and a **Nutrition** section on the Settings page for choosing tracked nutrients. Goals aren't shown on the daily sheet yet; what's still missing is in §9.*

What the Nutrition screens look like and how they behave. The data model is in [nutrition.md](../db/nutrition.md), the endpoints in [api-overview.md](../api/api-overview.md) §7.2, and the shell around these pages in [app-shell.md](app-shell.md). Engineering conventions (hooks, query keys, `Sheet`, `Field`, `Checkbox`, `Segmented`, date helpers) are in [web-overview.md](web-overview.md).

---

## 1. Routes and navigation

| Route | Page | Notes |
|---|---|---|
| `/nutrition` | (redirect) | Goes straight to `/nutrition/daily`. |
| `/nutrition/daily` | **Daily** (`DailyPage`) | Today's food sheet, "today" being in the user's timezone (`core.users.timezone`, falling back to the browser's). See §2. |
| `/nutrition/history` | **History** (`HistoryPage`) | See §3. |
| `/nutrition/history/$date` | **Day** (`DayPage`) | The same sheet as Daily, for another day, with a "← History" link above it. |
| `/nutrition/foods` | **Food repo** (`FoodsPage`) | See §4. |
| `/nutrition/goals` | **Goals** (`GoalsPage`) | See §6. |

**Sub-nav tabs:** Daily, History, Food repo, Goals. Tabs match by URL prefix, so **History stays active** on a past day's sheet.

**Links to a day** (`dayPath` in `components/DaySheet.tsx`): today always goes to `/nutrition/daily`; any other day goes to `/nutrition/history/<date>`. That applies to the day arrows, the History cards and "Go to a day".

**Home card** (`NutritionHomeCard`, built on the shared `ModuleCard` / `Meter`): links to `/nutrition/daily`. The subtitle reads "Today · N foods" or "Nothing logged yet today". If calories are tracked, today's calories show in large type, with an amber alert icon when some logged foods have no calorie value. Below that, one meter per goal for a **tracked** nutrient (goals for untracked nutrients are hidden): the nutrient, its kind (target / limit), "amount / goal" and a percentage. A limit over 100% turns amber; a reached target gets a teal check; an amber icon marks a nutrient some of today's foods lack. With no goals: "No daily goals yet. Add targets or limits on the Goals tab."

**Settings** (`NutritionSettings`, the module's `SettingsPanel`; see [app-shell.md](app-shell.md) §4): while Nutrition is on, the Settings page shows a **Nutrition** card with a checkbox for each of the eleven nutrients ("Protein (g)", ...). Each change **saves immediately** (no Save button); a failed save shows "Couldn't save. Try again." Only tracked nutrients appear on the daily sheets, history and food repo. New users track calories, protein, saturated fat, sodium and added sugars.

---

## 2. The daily sheet (`DaySheet`)

Used by both Daily and Day. Top to bottom:

```
Today                                         [ ‹ ] [ › ]   ← › hidden on today
Sunday, Oct 25, 2026
┌──────────────────────────────────────────────┐
│ CALORIES         PROTEIN ⚠       SAT. FAT    │  ← tracked nutrients only
│ 1,820 kcal       96 g            14.5 g      │
│ SODIUM           ADDED SUGARS                │
│ 2,140 mg         22 g                        │
│ ┌──────────────────────────────────────────┐ │
│ │ ⚠ Some foods have no value for these,    │ │  ← amber callout
│ │   so the totals may be low:              │ │
│ │   Protein: Banana                        │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
┌ Food ────────────────────────────────────────┐
│ Broccoli                             41 kcal │  ← first tracked nutrient
│ 1.2 × 100 g = 120 g · steamed                │  ← serving + notes
│ 3.4 g protein  0 g saturated fat  ...        │  ← other tracked nutrients
│ Banana                              210 kcal │
│ 2 × 1 banana                                 │
│ ? g protein  ...                             │  ← unknown value, amber
└──────────────────────────────────────────────┘
                                   [ + Log food ]  ← floating button
```

- **Header:** "Today", "Yesterday" or the weekday, with the full date under it (`formatLongDate`). On the right, **previous / next day** arrows (outline icon buttons). The next arrow is **hidden on today** (no future days). Arrows follow `dayPath`, so stepping forward onto today lands on `/nutrition/daily`.
- **Totals card:** each tracked nutrient's total for the day in a 2-column grid (3 from `sm` up). A total with no known value shows "—"; on a day with nothing logged, the numbers are muted.
  - When any logged food has no value for a tracked nutrient, that total gets a small **amber alert icon**, and an **amber callout** below the grid reads "Some foods have no value for these, so the totals may be low:" and lists, per nutrient, the foods missing it ("Protein: Banana, Broccoli").
  - Tracking **no** nutrients: the card instead says "You aren't tracking any nutrients. Choose some in Settings." with a link.
- **Food card:** the day's entries in the order they were logged. Each row shows the food name and its **first tracked nutrient** (e.g. calories) on the right, then the serving (`describeServing`: "120 g" for 1 serving of 120 g, "2 × 1 egg" when the standard is 1, "1.2 × 100 g = 120 g" otherwise) and the notes, then the other tracked nutrients in small text. An unknown value shows **"? unit"** in amber. Tapping a row opens the entry for editing (§5). With no entries: a "Nothing logged" empty state ("Tap Log food to add what you ate from your food repo.").
- **"Log food"** is a floating pill button fixed at the bottom-right (above the safe-area inset), like finance's Log transaction. It opens the log sheet (§5) for this day.
- Daily is keyed by today's date, so a sheet left open across midnight starts over on the new day.

---

## 3. History page

"Every day you've logged food, newest first."

- **Go to a day:** a `type="date"` input (max today). Picking a date opens that day's sheet, logged or not.
- **Day cards**, one per day with something logged, newest first: "Today" or the long date, "N foods", then each tracked nutrient's total (e.g. "1,820 kcal  96 g protein"). A card where any tracked total is missing values adds an amber **"missing values"** note. Tapping a card opens the day.
- Pages of **30 days**; **Show older days** loads the next 30 (`before` = the last date shown) while there are more.
- Empty state: "No days yet. Days show up here once you log food on them."

---

## 4. Food repo page

A **New** button in the header. Foods are listed by name.

- **Search** box ("Search N foods") filters by name and description as you type.
- Each row shows the name, "per 100 g" (the standard quantity), the description (if any) and the tracked nutrients for one standard quantity ("34 kcal  2.8 g protein ..."). An unknown value reads **"<nutrient> unknown"** in amber.
- Tapping a row opens the food in a sheet (title: the food's name) with the food form (§4.1) and **Delete food** (red; confirms "Days you logged it on keep it."). Deleting removes it from the repo and the log picker; past days keep showing it.
- Empty state: "No foods yet" with an "Add a food" button and a line explaining standard amounts.

### 4.1 Food form (`FoodForm`)

Used for New, editing, and adding a food from the log sheet (§5).

| Field | Behaviour |
|---|---|
| Name | Required, up to 100 characters. From the log sheet, pre-filled with what was searched. |
| Description (optional) | Up to 500 characters, e.g. "Steamed, from frozen". |
| Standard quantity / Unit | Side by side. Quantity defaults to **100**, unit to **g**. Unit is free text with suggestions from a native `<datalist>` (g, oz, ml, fl oz, cup, tbsp, tsp, piece, slice, serving, scoop, lb). Hint: "Nutrients below are for this amount. You log multiples of it: 1.2 × 100 g = 120 g." |
| Nutrients | One `inputMode="decimal"` field per nutrient, labelled with its unit ("Sodium (mg)"), placeholder "Unknown". **Tracked nutrients first**; the rest sit behind a **"Show nutrients you don't track (N)"** toggle, which starts open when the food already has values there. A note says: "Leave a nutrient blank if you don't know it. It won't count as 0." |

- Numbers accept digits with up to **6 decimal places** (commas and spaces are stripped), matching the API. **Blank = unknown** (sent as `null`). Anything else shows "<Nutrient>: enter a number (up to 6 decimal places), or leave it blank if unknown"; a zero or invalid quantity shows "Enter a standard quantity like 100 or 0.5 (up to 6 decimal places)".
- The form waits for the nutrient list (preferences) before rendering, so an edit never saves blanks over values it hadn't loaded.
- Buttons: **Add food** / **Save**, plus **Cancel** when opened from the log sheet. A duplicate name shows the API's "already exists" error.
- Saving a change to a food **recalculates every day that logged it**.

---

## 5. Log sheet (`LogSheet`)

Opened by **Log food** (title "Log food") or by tapping an entry (title: the food's name).

**Logging: pick a food** (`FoodPicker`)

- A **search** box ("Search your foods", autofocused), filtering by name and description.
- An **"Add a new food"** button; while searching for a name that isn't in the repo it reads **Add "<query>" as a new food**. It swaps the sheet to the food form (§4.1), pre-filled with the query, with a Cancel button. Saving it goes straight on to the amount step with the new food.
- Without a search: **Recent** (the 5 most recently logged foods, by `last_logged_on`), then **All foods**. With a search: **Matches**. Each row shows the name, "per <standard>" and the description.
- An empty repo shows "Your food repo is empty. Add a food to log it."

**Amount step** (`EntryForm`; also the edit form)

| Field | Behaviour |
|---|---|
| (food) | New entries show the food's name, "Standard: 100 g" and description, with a back arrow to pick a different food. |
| How many × <standard> | Autofocused, large text, default **1**. Must be more than 0, up to 6 decimal places ("Enter how many, like 1, 1.5 or 0.25 (up to 6 decimal places)"). Its hint shows the total amount ("= 120 g"). |
| (preview) | A live grid of the **tracked** nutrients for that amount, updating as you type; "unknown" in amber where the food has no value. |
| Day | `type="date"`, defaults to the sheet's day. Changing it moves the entry to another day. |
| Notes (optional) | Up to 500 characters. Shown next to the serving on the sheet. |

- Buttons: **Log it** for a new entry; **Save** and **Delete entry** (red; confirms "Remove <food> from this day?") when editing.
- **The food can't be changed** on an existing entry; delete it and log the other food.
- An entry whose food has since been deleted shows "This food was removed from your repo. You can still change or delete this entry."

---

## 6. Goals page

"Daily targets and limits. Changes apply from today; past days keep the goals they had."

Two cards:

- **Targets** ("Amounts to reach each day, like 150 g of protein."): rows read "<Nutrient> · reach at least 150 g".
- **Limits** ("Amounts to stay under each day, like 1,750 mg of sodium."): rows read "<Nutrient> · stay under 1,750 mg".

A goal for a nutrient the user doesn't track gets a **"not tracked"** chip. Each card ends with **Add a target** / **Add a limit**. The page shows the goals in effect today.

**Goal form** (in a sheet; "New target" / "New limit" / "Edit goal"):

| Field | Behaviour |
|---|---|
| Goal type | New goals only. Segmented **Target (reach at least)** / **Limit (stay under)**, preset from the button used. Changing it clears the nutrient. |
| Nutrient | New goals only. Select listing nutrients that **don't already have a goal of that type**, tracked ones first, untracked ones marked "(not tracked)". |
| Amount per day (unit) | Number up to 2 decimals, more than 0 ("Enter an amount like 150"). |

- Editing shows "Reach at least / Stay under this much <nutrient> a day." and only the amount. A change **applies from today**: a goal set today is changed in place; an older one ends yesterday and a new one starts today, so past days keep the old amount.
- **Remove goal** (red; confirms "Remove this goal from today on? Past days keep it.").
- A second goal of the same type for a nutrient is refused by the API (409), and the picker doesn't offer it.

Goals are **not compared with the day's totals anywhere yet** (§9).

---

## 7. What the numbers mean

| Number | Meaning |
|---|---|
| A food's nutrients | Per **one standard quantity** (e.g. per 100 g), as entered. Blank = unknown. |
| An entry's nutrients | The food's values × servings, from the API. Unknown stays unknown ("? g"). Because it's computed on read, editing a food changes every past entry of it. |
| A day's total | Sum of the **known** values of that nutrient over the day's entries. Foods without a value are listed in the amber callout, not counted as 0, so the total may be low. "—" when no entry has a value. 0 on a day with nothing logged. |
| History card "missing values" | At least one tracked nutrient's total that day is missing values. |

Numbers are shown with up to **1 decimal** and thousands separators ("1,234.5 mg"); quantities with up to 3 decimals (`format.ts`), though the API stores and returns 6. Calories read "250 kcal" without the word "calories".

---

## 8. Data and caching

Hooks live in `web/src/modules/nutrition/api.ts`; query keys are in `nutritionKeys` (`['nutrition', 'preferences']`, `['nutrition', 'foods']`, `['nutrition', 'day', date]`, `['nutrition', 'days']` (an infinite query, 30 per page), `['nutrition', 'goals']`). `useTrackedNutrients()` gives the tracked nutrients (label, unit) in display order, and is empty while loading.

| Mutation | Cache update |
|---|---|
| Save **tracked nutrients** | The returned preferences are **written straight into** `['nutrition', 'preferences']` (no refetch). |
| Create / update / delete **food** | Invalidate everything under `['nutrition']`: editing a food changes past days' numbers. |
| Log / update / delete **entry** | Invalidate everything under `['nutrition']`: a change touches a day, the history list and foods' "last logged" (Recent). |
| Create / update / delete **goal** | Invalidate `['nutrition', 'goals']`. |

Dates use the shared helpers in `shared/lib/dates.ts`: `todayIn(me.timezone)` for today, `addDays` for the previous / next day (calendar math, no timezone shift) and `formatLongDate` ("Sunday, Oct 18, 2026").

---

## 9. Not built yet

- **Goals on the daily sheet**: progress toward targets and warnings near limits (the Home card shows today's goal progress, §1, but the daily and history sheets don't yet). Planned as a later dashboard combining goals with day totals; the API already serves goals for any day (`GET /nutrition/goals?on=`).
- **Meals** (breakfast, lunch, ...), **recipes / saved meals**, and logging through Claude. See [nutrition.md](../db/nutrition.md) §6.
