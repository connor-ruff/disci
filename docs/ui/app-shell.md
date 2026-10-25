# App Shell & Navigation

*Status: planning draft. Nothing is built yet.*

The **shell** is the frame around every page: the top bar, the module menu, and how a user moves between modules. Individual modules (finance, tasks, nutrition) render their own pages *inside* the shell.

---

## 1. Principles

- **Modules are opt-in.** A new user starts with nothing enabled and turns on only the modules they want. The app should never feel like a wall of features.
- **Navigation is built from the enabled modules.** The shell never hard-codes "Finance". It renders whatever modules are registered *and* turned on for the user.
- **Phone-friendly from day one.** The same layout works in a phone browser (mobile app comes later).

---

## 2. Layout

```
┌──────────────────────────────────────────────────┐
│ ☰  Disci            Finance ▸ Budgets       [👤] │  ← top bar
├──────────────────────────────────────────────────┤
│ Budgets · Transactions · Recurring · Categories  │  ← module sub-nav
├──────────────────────────────────────────────────┤
│                                                  │
│               (module page content)              │
│                                                  │
└──────────────────────────────────────────────────┘
```

- **☰ opens the module menu**, a pop-out drawer from the left (a full-height sheet on phones):

```
┌───────────────────────┐
│  🏠  Home             │
│  ───────────────────  │
│  💵  Finance          │   ← enabled modules only
│  ───────────────────  │
│  ⊕  Manage modules    │   ← turn modules on/off
│  ⚙  Settings          │
└───────────────────────┘
```

- **Module sub-nav**: each module defines its own sections (e.g. Finance: Budgets, Transactions, Recurring, Categories). It appears as tabs under the top bar on desktop and a horizontally scrollable tab row on phones.
- **[👤] account menu**: profile, settings, sign out.

---

## 3. Pages owned by the shell

| Route | Page |
|---|---|
| `/` | **Home.** One summary card per enabled module (e.g. Finance: this month's budget vs. actual). With **no modules enabled**, it shows a welcome state with a button to turn one on. |
| `/modules` | **Manage modules.** A card per available module with a short description and an on/off toggle. Turning one on for the first time runs its setup (e.g. seeding default budget categories). |
| `/settings` | User settings (display name, timezone, week start). |
| `/<module>/...` | Everything else belongs to a module, e.g. `/finance/budgets/:id`. |

Visiting a disabled module's URL directly shows a "this module is off, turn it on?" prompt rather than an error.

---

## 4. How modules plug in (web)

Each module folder (`web/src/modules/<module>/`) exports a **manifest** that the shell reads:

| Field | Example (finance) | Used for |
|---|---|---|
| `key` | `'finance'` | Matches `core.user_modules.module_key`, the API folder and the Postgres schema |
| `name`, `icon`, `description` | "Finance", 💵, "Budgets, transactions and bills" | Module menu, manage-modules page |
| `routes` | `/finance/...` route tree | Mounted under `/<key>` by the shell |
| `subNav` | Budgets, Transactions, Recurring, Categories | Module sub-nav |
| `homeCard` | Budget vs. actual summary | Home page |

A **module registry** (`web/src/app/modules.ts`) lists all manifests. The shell shows the registry entries that the current user has enabled (fetched from the API). Adding a module means writing its folder and adding one line to the registry.

---

## 5. Open questions

1. **Module order** in the menu: fixed, or user-arrangeable?
2. **Home cards**: is one summary card per module the right home page, or should Home be something else?
3. **Visual style**: any apps whose look you like? Until then: clean and neutral (shadcn/ui defaults), with light and dark mode.
