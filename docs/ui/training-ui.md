# Training UI

*Status: **implemented** (`web/src/modules/training/`): the **Calendar** (a month of workouts, week totals, week detail), **History**, the **Log workout** sheet (every activity, with lifts and sets) and the Home card. What's not built yet (plans, the dashboard, lift progression) is in [roadmap.md](../roadmap.md).*

What the Training screens look like and how they behave. The data model is in [training.md](../db/training.md), the endpoints in [api-overview.md](../api/api-overview.md) §7.5, and the shell around these pages in [app-shell.md](app-shell.md). Engineering conventions (hooks, query keys, `Sheet`, `Field`, `Segmented`) are in [web-overview.md](web-overview.md).

---

## 1. Routes and navigation

| Route | Page | Notes |
|---|---|---|
| `/training` | (redirect) | Goes straight to `/training/calendar`. |
| `/training/calendar` | **Calendar** (`CalendarPage`) | See §2. |
| `/training/history` | **History** (`HistoryPage`) | See §3. |

**Sub-nav tabs:** Calendar, History.

**Log workout** is a floating pill button (plus icon) fixed at the bottom-right of both pages, above the safe-area inset (`LogWorkoutButton`). It opens the workout sheet (§4) for a new workout.

**Home card** (`TrainingHomeCard`, built on the shared `ModuleCard`): links to `/training/calendar`. The subtitle reads "Nothing logged this week" or "N workouts this week · M min" (minutes left out when no workout has a time). Below it, one line per activity done this week with its count; the Runs line adds the week's run miles. Weeks follow the user's week start.

Activities have fixed colors (`TYPE_BADGE` in `format.ts`): run teal, walk amber, bike sky, lift violet. They show as a small letter badge (R, W, B, L).

---

## 2. Calendar page

```
  ‹            November 2026            ›
  M   T   W   T   F   S   S   Week
┌───┬───┬───┬───┬───┬───┬───┐┌──────┐
│ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 ││ 12.3 │
│5.0│ L │4.3│ B │   │3.0│ W ││run mi│  ← bold = run miles; letters = other workouts
└───┴───┴───┴───┴───┴───┴───┘└──────┘
 ...
 Bold numbers are run miles. Letters are other workouts. Tap a week for details.

 Nov 2 – Nov 8                 12.3 run mi · 6 workouts
┌ Monday, November 2 ──────────────────────────┐
│ [R] Run · 5 mi                               │
│     45:00 · 9:00/mi · easy run · Hoboken     │
└──────────────────────────────────────────────┘
 ...                                [ + Log workout ]
```

- A **month** at a time, with previous / next arrows around the month name. It opens on the current month.
- **One row per week**, weeks starting on the user's week start (`week_starts_on`); the weekday letters follow it. Days outside the month are dimmed; today has an accent border.
- **Day cells** show the day number, the day's **run miles** in bold, and a letter badge for each other workout (walk, bike, lift).
- The **Week** column shows the week's run miles ("run mi") when there are any, otherwise its workout count. Future weeks show "–".
- **Tapping a week** selects it (highlighted) and shows its detail below the grid: the date range and a summary ("12.3 run mi · 6 workouts"), then one card per day that has workouts, with a row per workout (§3.1, without the date). An empty week reads "Nothing logged this week." The current week is selected on first load; moving to another month clears the selection.
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

## 5. Data and caching

Hooks live in `web/src/modules/training/api.ts`; query keys are in `trainingKeys` (`['training', 'workouts', filter]`, `['training', 'lifts']`, `['training', 'locations']`). The Calendar fetches the workouts for the weeks on screen, History by activity and page, and the Home card this week's.

| Mutation | Cache update |
|---|---|
| Log or edit a workout (`useSaveWorkout`) | Invalidate everything under `['training']`: workouts, the lift catalog ("last time") and recent locations can all change. |
| Delete a workout (`useDeleteWorkout`) | Invalidate everything under `['training']`. |

---

## 6. Not built yet

See [roadmap.md](../roadmap.md).
