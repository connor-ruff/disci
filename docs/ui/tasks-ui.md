# Tasks UI

*Status: **implemented** (`web/src/modules/tasks/`): **Today** (the daily checklist, what's due, what's coming up and what to keep in mind), **All tasks** (every task by kind, where tasks are added, changed and removed), the **Kinds** guide to the four task types, the task sheet (view, then edit) and the Home card. What's still missing is in §8.*

What the Tasks screens look like and how they behave. The data model is in [tasks.md](../db/tasks.md), the endpoints in [api-overview.md](../api/api-overview.md) §7.3, and the shell around these pages in [app-shell.md](app-shell.md). Engineering conventions (hooks, query keys, `Sheet`, `Field`, date helpers) are in [web-overview.md](web-overview.md).

---

## 1. Routes and navigation

| Route | Page | Notes |
|---|---|---|
| `/tasks` | (redirect) | Goes straight to `/tasks/today`. |
| `/tasks/today` | **Today** (`TodayPage`) | See §2. |
| `/tasks/all` | **All tasks** (`AllTasksPage`) | See §3. |
| `/tasks/types` | **Kinds of task** (`TypesPage`) | See §5. |

**Sub-nav tabs:** Today, All tasks, Kinds.

**"Today"** is the user's today, worked out by the API in their timezone (`core.users.timezone`); the web app never sends a date.

**New task** is a floating pill button fixed at the bottom-right (above the safe-area inset), like finance's Log transaction, on Today and All tasks. It opens the task sheet at the type picker (§4.2).

**Home card** (`TasksHomeCard`, built on the shared `ModuleCard` / `Meter`): links to `/tasks/today`. The subtitle reads "No tasks yet", "Nothing due today", or "N due" (overdue or due today, not done) with " · M past due" when some are overdue. With daily checklist items, a **Daily checklist** meter shows "done / total" (items that reached their target today). Below it, the first **three** due tasks by name, then "and N more".

---

## 2. Today page

Cards, top to bottom, each shown only when it has something in it:

```
Today
┌ Daily checklist ─────────────── 1 of 3 done ┐
│ ( ✓ )  Take cholesterol pill              › │  ← done: filled check, crossed off
│ − (2/5) Jaw exercises                     › │  ← counting: minus + "2/5"
│        2 of 5 today                         │
│ (   )  Fill the Brita                     › │
└─────────────────────────────────────────────┘
┌ Due ────────────────────────────────────────┐
│ (   )  Wash the bedsheets                 › │
│        2 days past due                      │  ← amber, gently worded
│ ( ✓ )  Book flights                       › │  ← to-do done today: crossed off
│        Done                                 │
└─────────────────────────────────────────────┘
┌ Keep in mind ───────────────────────────────┐
│  💡    Remember to say please             › │  ← no check control
└─────────────────────────────────────────────┘
┌ Coming up ──────────────────────────────────┐
│ Due in the next week.                       │
│ (   )  Return Black Wave                  › │
│        Due in 5 days                        │
└─────────────────────────────────────────────┘
┌ Anytime ────────────────────────────────────┐
│ To-dos without a due date.                  │
└─────────────────────────────────────────────┘
                                 [ + New task ]
```

| Section | What's in it |
|---|---|
| **Daily checklist** | Every daily checklist item. The heading's right side reads "N of M done" (items at their target). |
| **Due** | Maintenance and to-dos that are **overdue or due today** and not done, then those **done today**: a to-do finished today stays here crossed off until the day ends (the next day the API leaves it out), and a maintenance task done today shows "Done today" with its new due date. |
| **Keep in mind** | Every keep-in-mind task, with a lightbulb instead of a check control. |
| **Coming up** | "Due in the next week.": maintenance and to-dos due in the next **7 days** (`SOON_DAYS`), not done. |
| **Anytime** | "To-dos without a due date.": open to-dos with no `next_due`. |

- Anything due **more than a week out** isn't on Today; it's on All tasks.
- With no daily items and nothing due, a muted line reads "Nothing due today."
- With **no tasks at all**: an empty-state card, "No tasks yet. Tap New task to add one. See the four kinds to pick the right one." (linking to Kinds).

### 2.1 Task rows (`TaskRow`)

Each row is the **check control** on the left, then a button (name, a line of detail, a chevron) that opens the task sheet (§4).

- **Detail line**, joined with " · ": for a daily item with a target above 1, "2 of 5 today"; on All tasks, the cadence ("Every 2 weeks"); "Done today" (maintenance) or "Done" (to-do) when done; the due wording (below), except on a finished to-do; then the description.
- **Due wording** (`describeDue` in `format.ts`): "Due today", "Due tomorrow", "Due in N days" (under a week), "Due Nov 8" (further out), and when overdue "1 day past due" / "N days past due" in **amber**. Overdue starts the day after the due date (no grace period), so the wording stays gentle: no red, no "overdue".
- **Crossed off** (muted, struck through): a finished to-do and a daily item that has reached its target, until the day ends. A maintenance task done today isn't crossed off, since it's already due again later.

### 2.2 The check control (`CheckControl`)

A round button (44 px tap target). Keep-in-mind tasks have none.

| Task | Control | Tap |
|---|---|---|
| Daily item, target **above 1** (**counting**) | The circle shows "2/5" until the target is reached, then a filled check. A small **minus** button to its left appears once there's at least one check-off today. | The circle **adds one** (going past the target is fine). The minus **takes one back** (undo of today's latest). |
| Daily item with target 1, maintenance, to-do (**toggle**) | Empty circle, or a filled check when done. | Checks it off, or, when done, **undoes** it ("Mark <name> not done"). Undoing maintenance puts its due date back. |

The control is disabled while its request is in flight. Check-offs always count for **today**; the API can record a past day, but the UI doesn't offer it yet.

---

## 3. All tasks page

"Everything you're keeping track of, by kind. Tap one to see or change it."

- One card per type, in the fixed order (Daily checklist, Maintenance, To-do, Keep in mind), even when empty. The heading shows the count; the hint under it is the type's summary from `GET /tasks/types`.
- Rows are the same `TaskRow`s as Today, with the **cadence** added to maintenance rows ("Every 2 weeks"). Check controls work here too.
- Each card ends with **Add <type>** ("Add daily checklist", "Add to-do"...), which opens a new task of that type, skipping the picker.
- Finished to-dos show here only on the day they were done.

---

## 4. Task sheet (`TaskSheet`)

One bottom sheet for viewing, editing and adding, like finance's transaction view. It opens **on the view** for an existing task, and on the form for a new one.

### 4.1 View, then edit

Tapping a task opens its **view** (title: the task's name):

- The type ("Maintenance").
- **Facts list**, depending on the type:
  - **Each day** (daily): "Once" or "5 times", then "· 2 today".
  - **How often** (maintenance): "Every 2 weeks, roughly".
  - **Next due** (maintenance) / **Due** (to-do): the long date and the due wording (amber when past due; hidden on a finished to-do), or "No due date".
  - **Last done** / **Done** (to-do): the long date, or "Not yet". Not shown for keep in mind.
- The **description**, when it has one.
- **Recently done** (daily and maintenance): the last 10 check-offs as days, newest first, with counts for repeats ("Oct 27 (×3), Oct 26, Oct 24").
- **Edit** and **Delete task** (red; confirms "Delete "<name>"? What you've done stays in your history.", then closes).

**Edit** (title "Edit task") swaps in the form (§4.3) pre-filled, with **Save** and **Cancel**; both return to the view. The type can't be changed. Checking off isn't in the sheet: it's the row's control.

### 4.2 New task: the type picker

**New task** (title "New task") first asks "What kind of task is it?": one button per type with its name and summary (from `GET /tasks/types`), and a **More about the types** link to the Kinds page. Picking one shows the form. **Add <type>** (All tasks) and **Add one** (Kinds) open the form with the type already picked.

### 4.3 Task form

A new task shows its type at the top with **Change type** (back to the picker); an existing one just shows the type.

| Field | Types | Behaviour |
|---|---|---|
| Name | all | Required, up to 200 characters. Placeholder: the type's first example ("Take cholesterol pill"). |
| Times a day | daily | Whole number, 1 or more, default **1**. Hint: "Check it off this many times to finish it for the day." |
| How often (roughly) | maintenance | "Every [1] [week ▾]": a number (default 1) and a unit select (day, week, month, quarter, year; plural when the number isn't 1). Hint: "After you do it, it's due again this long after." |
| Next due | maintenance | Date. New: "Leave empty to start today." Editing: required, hint "Move it to snooze." |
| Due date (optional) | to-do | Date, or empty for an Anytime to-do. |
| Description (optional) | all | Up to 1,000 characters. |

- Errors: "Times a day must be a whole number, 1 or more", "How often must be a whole number, 1 or more", "Pick when it's next due"; API errors show under the button.
- Buttons: **Add task** / **Save**.
- Only the picked type's fields are sent (the others as null).

---

## 5. Kinds page (`TypesPage`)

Header "Kinds of task": "Every task is one of these four. Each behaves a little differently."

One card per type, in order, each with an icon (daily: calendar check; maintenance: repeat; to-do: list; keep in mind: lightbulb), the name and summary, a paragraph on **how it works**, the examples as small chips, and an **Add one** button that opens the task form for that type. All the text comes from `GET /tasks/types` (`service.TASK_TYPES`), so the API is the single source for how the types are described.

---

## 6. What the states mean

| State | Meaning |
|---|---|
| Daily item "done" | Today's check-offs reached the target. Each day starts at zero. |
| Maintenance "done" | Checked off today. It's already due again (a new due date), so it isn't crossed off. |
| To-do "done" | Checked off. Crossed off today, gone from the lists tomorrow; kept in history. |
| "N days past due" | The due date has passed (no grace period). Amber, worded gently. |

---

## 7. Data and caching

Hooks live in `web/src/modules/tasks/api.ts`; query keys are in `tasksKeys` (`['tasks', 'list']`, `['tasks', 'task', id]`, `['tasks', 'types']`). `useTasks()` is `GET /tasks` (today); `useTaskTypes()` never goes stale (`staleTime: Infinity`), since the types are fixed. Type labels, the type order, units and the due / cadence wording are in `format.ts`.

| Mutation | Cache update |
|---|---|
| Create / update task (`useSaveTask`) | Invalidate everything under `['tasks']`. |
| Delete task | Invalidate everything under `['tasks']`. |
| Check off / undo (`useCheck`) | Invalidate everything under `['tasks']`: the list, the open task and the Home card all change. |

---

## 8. Not built yet

- **Visualizations**: richer ways to see tasks and progress (streaks, history, calendars). The user will send inspiration.
- **Reordering** tasks within a section (today: soonest due, then name).
- **Checking off a past day** and a "what I did today" view: the API supports both (`{on}`, `GET /tasks/completions`), the UI doesn't yet.
- **MCP tools** for tasks; see [tasks.md](../db/tasks.md) §6.
