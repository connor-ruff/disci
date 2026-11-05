# Training UI

*Status: **implemented** (`web/src/modules/training/`): the **Calendar** (a month of workouts with the active plan laid over it, week scores, week detail), **History**, the **Log workout** sheet (every activity, with lifts and sets), the **Plan** tab and **Start a plan** page, and the Home card. What's not built yet (the dashboard, lift progression) is in [roadmap.md](../roadmap.md).*

What the Training screens look like and how they behave. The data model is in [training.md](../db/training.md), the endpoints in [api-overview.md](../api/api-overview.md) §7.5, and the shell around these pages in [app-shell.md](app-shell.md). Engineering conventions (hooks, query keys, `Sheet`, `Field`, `Segmented`) are in [web-overview.md](web-overview.md).

---

## 1. Routes and navigation

| Route | Page | Notes |
|---|---|---|
| `/training` | (redirect) | Goes straight to `/training/calendar`. |
| `/training/calendar` | **Calendar** (`CalendarPage`) | See §2. |
| `/training/history` | **History** (`HistoryPage`) | See §3. |
| `/training/plan` | **Plan** (`PlanPage`) | See §5. |
| `/training/plan/new` | **Start a training plan** (`NewPlanPage`) | See §6. Opened from the Calendar's "Start a plan" link, the Plan page's "Start a new plan" button and its no-active-plan card. |

**Sub-nav tabs:** Calendar, History, and **Plan**, shown only once the user has any plan (active or past; the tab's `useShown` hook is `useHasPlans`, see [app-shell.md](app-shell.md) §2). Until then the way in is "Start a plan" on the Calendar. The Plan tab stays highlighted on `/training/plan/new`.

**Log workout** is a floating pill button (plus icon) fixed at the bottom-right of the Calendar and History pages, above the safe-area inset (`LogWorkoutButton`). It opens the workout sheet (§4) for a new workout.

**Home card** (`TrainingHomeCard`, built on the shared `ModuleCard`): links to `/training/calendar`. The subtitle reads "Nothing logged this week" or "N workouts this week · M min" (minutes left out when no workout has a time). Below it, one line per activity done this week with its count; the Runs line adds the week's run miles. Weeks follow the user's week start.

Activities have fixed colors (`TYPE_BADGE` in `format.ts`): run teal, walk amber, bike sky, lift violet. They show as a small letter badge (R, W, B, L).

---

## 2. Calendar page

```
 ┌ ⚑ NYC Marathon   Nov 7                 116 days ┐   ← plan banner (or "Training for a race? Start a plan")
 └────────────────────────────────────────────────┘
  ‹            November 2026            ›
  M   T   W   T   F   S   S   Week
┌───┬───┬───┬───┬───┬───┬───┐┌──────┐
│2 3│3  │4 3│5  │6  │7 6│8  ││ 🙂   │
│3.1│ L │3.0│ B │   │6.2│ W ││ 12.3 │  ← small = planned miles; bold = run miles done
│   │   │   │   │   │   │   ││ / 12 │  ← week: miles done / target, colored by status
└───┴───┴───┴───┴───┴───┴───┘└──────┘
 ...
 Small numbers are planned miles, bold numbers are miles done. Green: in range (±10%).
 Red: over. Yellow: under. Tap a week for details.

 Nov 2 – Nov 8                                3 of 3 runs
┌ 🙂 12.3 mi: weekly mileage met ────────────────────────┐
│    Right inside your 10.8–13.2 mi range. Nice work.     │
└─────────────────────────────────────────────────────────┘
┌ Monday, November 2 ─────────────── Plan: 3 mi · easy ┐
│ [R] Run · 3.1 mi                                     │
│     28:00 · 9:02/mi · Hoboken                        │
└──────────────────────────────────────────────────────┘
┌ Tuesday, November 3 ─────────────────────────── Rest ┐
│ [L] Lift · 45 min                                    │
└──────────────────────────────────────────────────────┘
 ...                                [ + Log workout ]
```

- A **month** at a time, with previous / next arrows around the month name. It opens on the current month.
- Above the month, the **plan banner** with an active plan: a flag, the race name (or the plan name without one), the race day, and the **days to race** on the right (hidden once the race has passed). Tapping it opens the Plan page. **Without an active plan**, a dashed "Training for a race? **Start a plan**" link to `/training/plan/new` sits there instead.
- **One row per week**, weeks starting on the user's week start (`week_starts_on`); the weekday letters follow it. Days outside the month are dimmed; today has an accent border.
- **Day cells** show the day number, the day's **planned miles** small in the top-right corner (when the active plan has miles that day), the day's **run miles** in bold, and a letter badge for each other workout (walk, bike, lift).
- The **Week** column, for a week the active plan gives a target, is colored by its status (from `GET /training/weeks`; the rules are in [training.md](../db/training.md) §4.1; the colors are `STATUS_STYLE` in `format.ts`):

| Status | Look |
|---|---|
| In range | Green, with a smile icon; miles done over "/ target". |
| Over | Red, with a warning icon; miles done over "/ target". |
| Under (a finished week) | Yellow; miles done over "/ target". |
| In progress (this week, not in range yet) | Teal; miles done over "/ target". |
| Upcoming | Dashed outline, muted: the planned target over "planned". |

  A week with no target (no active plan, or a plan week with no miles) shows the plain total instead: its run miles ("run mi") when there are any, otherwise its workout count; future weeks show "–".
- The note under the grid explains the numbers and colors with a plan, or just "Bold numbers are run miles. Letters are other workouts." without one.
- **Tapping a week** selects it (outlined) and shows its detail below the grid:
  - The date range, and on the right "N of M runs" (runs done vs. planned days) for a scored week, otherwise the week summary ("12.3 run mi · 6 workouts").
  - A **status message** in the status's colors, for a scored week:

| Status | Message |
|---|---|
| Over | "13.9 mi: over your 10.8–13.2 mi range" / "Take it easy. A bike ride, walk or lift will support your training more than another run." |
| In range | "12.3 mi: weekly mileage met" / "Right inside your 10.8–13.2 mi range. Nice work." |
| Under | "8 of 12 mi" / "Below your 10.8–13.2 mi range." |
| In progress | "8 of 12 mi so far" / "Range 10.8–13.2 mi.", or, once the cross-training cue is on, "You've reached 90% of this week's target. A bike ride, walk or lift…" |
| Upcoming | "Planned: 12 mi" / "Range 10.8–13.2 mi · 3 planned runs." |

  - Then the days. **With an active plan, every day of the week** shows, with its plan on the right ("Plan: 5 mi · tempo", or "Rest" when nothing is planned) and its workouts (§3.1, without the date); a day with none reads "Coming up" (a future day), "No run logged" (a planned day) or "Nothing logged". **Without a plan**, only days with workouts show, and an empty week reads "Nothing logged this week."
  - The current week is selected on first load; moving to another month clears the selection.
- Tapping a workout opens it in the workout sheet (§4).

---

## 3. History page

"History": every workout, newest first.

- An **Activity** filter (`Segmented`, small): All, Runs, Walks, Bikes, Lifts.
- Workouts are **grouped by week** (the user's week start). Each week has a heading with its date range and summary ("12.3 run mi · 4 workouts", or just the count without runs) and a card of workout rows.
- Loads 100 at a time; **Show more** loads the next 100 when the page is full.
- With nothing logged (or nothing of the filtered activity): a dumbbell icon, "No workouts yet" (or "No runs yet", etc.) and "Tap Log workout to add your first one."
- Tapping a row opens the workout sheet (§4) to edit it.

### 3.1 Workout row (`WorkoutRow`)

Shared by History and the Calendar's week detail.

- The activity's letter badge, then a **title**: "Run · 5 mi" when it has miles, otherwise "Lift · 55 min" when it has a time, otherwise just the activity. The date is on the right (History only).
- A **detail line**, joined by " · ": time (when it has miles), pace per mile (not for bikes), minutes (bikes), description, location, heart rate ("152 bpm"), elevation ("420 ft gain").
- A lift's **sets grouped by lift**, in the order done: "**Bench press** 185 × 5, 185 × 5, 185 × 4". Bodyweight shows as "BW".
- The **reflection** in italics, in quotes.

---

## 4. Workout sheet (`WorkoutSheet`)

One bottom sheet for logging (title "Log workout") and editing (title "Workout").

| Field | Behaviour |
|---|---|
| Activity | `Segmented`: Run, Walk, Bike, Lift. New workouts start on Run. Changing it changes the fields below. |
| Date | Native date picker, today by default, no later than today. |
| Time (optional) | `48:30`, `1:05:00`, or a plain number of minutes (`45`). Anything else shows "Time should look like 48:30 or 1:05:00." |
| Miles | Run, walk and bike only. Required for runs and walks ("A run needs miles."), optional for bikes. |
| Avg heart rate | Run, walk and bike only. Digits only. |
| Elevation gain (ft) | Run, walk and bike only. Digits only. |
| Location (optional) | Free text, up to 100 characters. Up to **four recent locations** show as chips below it; tapping one fills the field. |
| Description (optional) | Up to 300 characters. For a lift it's labelled "Body parts / description" (hint "e.g. Push, back/chest, legs"). |
| Lifts and sets | Lift only. See §4.1. |
| Reflection (optional) | A text area, up to 5000 characters: "How did it feel? Anything to remember next time?" |

**Log workout** / **Save** saves and closes; errors show above the button. When editing, **Delete workout** (red) confirms "Delete this workout?", then deletes it and closes. Saving a workout as a run, walk or bike drops any lift sets; saving it as a lift drops miles, heart rate and elevation.

### 4.1 Lifts and sets

"Lifts and sets (optional)", with the hint "Weight in lb; blank = bodyweight".

- The workout's lifts, **in the order done**, each in its own box: a lift name field (suggestions from the user's catalog, most recently done first) with a remove button, then its sets as rows of **Set** number, **Weight (lb)** (blank = bodyweight, placeholder "BW") and **Reps**, each with a remove button.
- **Add set** adds a set that **copies the one before it**, since most sets repeat. **Add lift** adds a new box with one empty set.
- **"Last time"**: once a name matches a lift in the catalog (any case), the box shows what was done the last time, e.g. "Last time (Nov 2): 185 × 5, 185 × 4". Shown only when **logging a new workout**: when editing, "last time" could be this very workout.
- On save, a box with no name and a set with no reps are skipped. Sets are sent in order, so the order of the boxes is the order the lifts were done. A new name adds the lift to the catalog.
- Editing a workout rebuilds the boxes from its sets: consecutive sets of the same lift form one box.

---

## 5. Plan page

`/training/plan`: the active plan and past plans.

```
┌ NYC Marathon 2027                        Edit ┐
│ Race: NYC Marathon · Nov 7, 2027              │
│ Starts Apr 26 · 612 mi planned over 110 days  │
│ (Active plan)                                 │
└───────────────────────────────────────────────┘
┌ Rules ────────────────────────────────────────┐
│ Count walk miles                         [○ ] │
│ Suggest cross-training at            [ 90 ] % │
└───────────────────────────────────────────────┘
┌ Planned miles               Paste from a sheet ┐
│ Wk  M  T  W  T  F  S  S  Total                │
│ 1   ·  3  ·  3  ·  6  ·     12                │
│ 2   ·  3.5 · 4  ·  7  ·     15   ← purple: a weekly target set by hand
└───────────────────────────────────────────────┘
┌ Past plans ───────────────────────────────────┐
│ Philly Half  Sep 1 – Nov 23, 2026 · 240 mi    │
│                     [Make active]  Delete     │
│ [ Start a new plan ]                          │
└───────────────────────────────────────────────┘
```

- **Details card**: the plan name, the race name and race day, "Starts <date> · N mi planned over M days", and an "Active plan" badge. **Edit** opens the "Plan details" sheet (`PlanDetailsFields`: name, race, plan start, race day) with **Save**.
- **Rules card** (`PlanRulesFields`): **Count walk miles** (a switch: walks add to weekly miles) and **Suggest cross-training at** N % of the week's target ("90 is the bottom of the ±10% range"). **Save rules** appears once something changed.
- **Planned miles card**: one row per week from the week holding the plan's start to the week holding its race day or last planned day, whichever is later, numbered from 1. Columns follow the user's week start: each day's planned miles ("·" for rest) and the week's **Total**, the sum of its days, or in **purple** a weekly target set by hand. Tapping a week opens its **week editor** sheet ("Week of <date>"):
  - One row per day: day name, **Miles** (blank = rest) and **Notes** (optional, up to 200 characters).
  - **Weekly target (optional)**: blank uses the sum of the days, shown as the hint and placeholder.
  - **Save week** replaces that week's days and target (`PUT /training/plans/{id}/weeks/{starts_on}`).
- **Paste from a sheet** (on the Planned miles card) opens the "Replace miles from a sheet" sheet: the grid paste box (§7) and "This replaces every planned day in <plan>. Weekly targets you set stay." **Replace planned miles** is enabled once the paste has days.
- **Past plans card** (shown with an active plan, or with past plans and none active): each plan's name, dates ("Sep 1 – Nov 23, 2026") and total miles, with **Make active** and **Delete** (confirms "Delete "<name>"? Your workouts aren't affected."). "None yet." when there are none. **Start a new plan** at the bottom links to `/training/plan/new`.
- **No active plan**: a flag icon, "No active plan", "Start a plan, or make a past one active again." and a **Start a plan** button, above the past plans.
- The active plan itself has no delete button: making another plan active (or starting a new one) moves it to past plans, where it can be deleted.

---

## 6. Start a training plan page

`/training/plan/new` ("Start a training plan"): three cards and a button.

1. **Details** (`PlanDetailsFields`): **Plan name** (required, up to 100 characters, e.g. "NYC Marathon 2027"), **Race (optional)**, **Plan starts** (defaults to the start of the current week) and **Race day (optional)**.
2. **Planned miles**: a `Segmented` choice between **Paste from a sheet** (the default; the grid paste box, §7) and **Type them in** ("Your plan starts empty. On the Plan tab, tap a week and fill in each day's miles and notes."). When a paste is read, the plan start moves back to the week of its first day if that's earlier.
3. **Rules** (`PlanRulesFields`): as on the Plan page.

**Create plan** (enabled once there's a name) creates the plan as the **active** one and opens the Plan page. When there's already an active plan, a note above the button says "This becomes your active plan. Your current one moves to past plans; your workouts don't change."

---

## 7. Grid paste (`GridPaste`)

The box for pasting a plan from a spreadsheet, used by the Start a plan page and the Plan page's replace sheet.

- Instructions: "Copy the rows from your spreadsheet: the week start date, then Monday through Sunday miles. Leave a day blank for rest. A note can follow the number ("6 long run")."
- A monospace text area, **Pasted rows**. A moment (300 ms) after the text stops changing, it's sent to `POST /training/plans/grid`, which reads it without saving (rules in [training.md](../db/training.md) §4.2).
- A **preview** below: "Found N weeks · M run days · X mi", the first nine days ("Apr 27: 3 · Apr 29: 3 · …"), and, when some rows or cells couldn't be read, a collapsed "N things couldn't be read" list with the API's messages (the first 20).
- The read days are what's saved: on create, or as the replacement days.

---

## 8. Data and caching

Hooks live in `web/src/modules/training/api.ts`. Workout query keys are in `trainingKeys` (`['training', 'workouts', filter]`, `['training', 'lifts']`, `['training', 'locations']`); plan keys are in `planKeys` (`['training', 'plans', 'list']`, `['training', 'plans', 'plan', id]`, `['training', 'weeks', start, end]`). The Calendar fetches the workouts and the week scores (`useWeeks`) for the weeks on screen, History by activity and page, the Home card this week's workouts, and the Plan page the plan list (`usePlans`, which also decides whether the Plan tab shows) and the active plan's detail (`usePlan`). The grid preview (`useReadGrid`) is a mutation, so nothing is cached.

| Mutation | Cache update |
|---|---|
| Log or edit a workout (`useSaveWorkout`) | Invalidate everything under `['training']`: workouts, week scores, the lift catalog ("last time") and recent locations can all change. |
| Delete a workout (`useDeleteWorkout`) | Invalidate everything under `['training']`. |
| Create, edit, activate or delete a plan, edit a week or replace its days (`useCreatePlan`, `useUpdatePlan`, `useSetPlanActive`, `useDeletePlan`, `useEditWeek`, `useReplaceDays`) | Invalidate everything under `['training']`: the plan list, the plan, and the Calendar's week scores can all change. |

---

## 9. Not built yet

See [roadmap.md](../roadmap.md).
