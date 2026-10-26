# App Shell & Navigation

*Status: **implemented** in `web/src/app/`. Home, Manage modules and Settings work, and the finance and nutrition modules render their pages inside the shell (see [finance-ui.md](finance-ui.md) and [nutrition-ui.md](nutrition-ui.md)). Engineering details (stack, conventions, dev workflow) are in [web-overview.md](web-overview.md).*

The **shell** is the frame around every page: the top bar, the module menu, and how a user moves between modules. Individual modules (finance, tasks, nutrition) render their own pages *inside* the shell.

---

## 1. Principles

- **Modules are opt-in.** A new user starts with nothing enabled and turns on only the modules they want. The app should never feel like a wall of features.
- **Navigation is built from the enabled modules.** The shell never hard-codes "Finance". It renders whatever modules are registered *and* turned on for the user.
- **Phone-first.** The app will mostly be used on phones (see [ui-overview.md](ui-overview.md)), so the layout is designed for a phone browser first and widens gracefully (mobile app comes later).

---

## 2. Layout

```
┌──────────────────────────────────────────────────┐
│ ☰  Disci / Finance                          [👤] │  ← top bar (sticky)
├──────────────────────────────────────────────────┤
│ Budgets · Checklist · Recurring · Inbox · Categories │  ← module sub-nav (only if > 1 tab)
├──────────────────────────────────────────────────┤
│                                                  │
│               (module page content)              │
│                                                  │
└──────────────────────────────────────────────────┘
```

- **Top bar** (`Shell.tsx`): ☰ button, "Disci" (links to Home), and, inside a module, " / <module name>". Content is capped at a readable width (`max-w-3xl`) on wide screens.
- **☰ opens the module menu** (`ModuleMenu.tsx`), a full-height drawer that slides in from the left (`shared/ui/drawer.tsx`, built on the Radix Dialog). It closes on any navigation.

```
┌───────────────────────┐
│  🏠  Home             │
│  ───────────────────  │
│  💵  Finance          │   ← enabled modules only (hidden if none)
│  🥗  Nutrition        │
│  ───────────────────  │
│  ⊞  Manage modules    │   ← turn modules on/off
│  ⚙  Settings          │
└───────────────────────┘
```

- **Module sub-nav**: each module lists its own tabs in its manifest (`subNav`). The row renders **only when a module has more than one tab**, so a single-page module gets no tab bar. It is a horizontally scrolling pill row on every screen size (works on phones without wrapping). A tab is active when the URL starts with its path, so a detail page (e.g. `/finance/budgets/<id>`) keeps its list tab highlighted.
- **Pull-to-refresh** (`PullToRefresh.tsx`, rendered by the shell): in the home-screen app only, pulling down from the top of any page reloads the app. Details in [web-overview.md](web-overview.md) §7.
- **[👤] account icon**: links straight to `/settings`. There's no account dropdown; **Sign out** is a button on the Settings page (production/Cognito only; local dev auth has no sign-in).

---

## 3. Pages owned by the shell

| Route | Page | API |
|---|---|---|
| `/` | **Home.** With **no modules enabled**: a welcome card with a "Choose modules" button (→ `/modules`). Otherwise "Hi, <display name>" and one `HomeCard` per enabled module. | `GET /me`, `GET /me/modules` |
| `/modules` | **Manage modules.** A card per available module (icon, name, description from the API) with an on/off switch. Turning one on for the first time runs its setup on the API side (e.g. seeding default budget categories). | `GET /me/modules`, `PUT /me/modules/{key}` (on), `DELETE /me/modules/{key}` (off) |
| `/settings` | **Settings.** Email (read-only), display name, timezone (a native select of every IANA zone from `Intl.supportedValuesOf`, plus a "Use this device's timezone" shortcut when it differs), week start. Below that, one card per **enabled** module that has a `SettingsPanel` (§4), e.g. Nutrition's tracked nutrients; then Sign out (Cognito only). | `GET /me`, `PUT /me`, `GET /me/modules`, plus each panel's own endpoints |
| `/<module>/...` | Everything else belongs to a module, e.g. `/finance` (redirects to `/finance/budgets`; see [finance-ui.md](finance-ui.md)) or `/nutrition` (redirects to `/nutrition/daily`; see [nutrition-ui.md](nutrition-ui.md)). | Module endpoints |
| anything else | **Not found** page with a "Go home" button. | |

**Disabled-module gate.** The shell checks the first URL segment: if it matches a registered module that the user has turned **off**, it shows a "<Module> is turned off" card with a "Turn on <Module>" button instead of the page (and hides the sub-nav). No error, and the data is kept.

---

## 4. How modules plug in (web)

Each module folder (`web/src/modules/<key>/`) exports a **manifest** (`ModuleManifest`, defined in `web/src/app/module.ts`) from its `index.ts`:

| Field | Example (finance) | Used for |
|---|---|---|
| `key` | `'finance'` | Matches the API module key (`core.user_modules.module_key`), the Postgres schema and the URL prefix `/<key>` |
| `icon` | `Wallet` (lucide-react) | Module menu, manage-modules page, disabled-module gate |
| `route` | `financeRoute`: the TanStack Router tree under `/finance` (`routes.tsx`) | Added to the router's route tree |
| `subNav` | Budgets, Checklist, Recurring, Inbox, Categories (`/finance/budgets`, `/finance/checklist`, ...) | Module sub-nav (shown only when > 1 entry) |
| `HomeCard` | `FinanceHomeCard` component | Home page |
| `SettingsPanel` (optional) | Nutrition's `NutritionSettings` (finance has none) | A section on the Settings page, rendered below the user's settings while the module is **enabled**. Each module's panel is its own card and saves through its own endpoints. |

**Name and description are not in the web manifest.** They come from the API (`GET /me/modules`), so they are defined once, in the API's module registry (see [api-overview.md](../api/api-overview.md)).

| Piece | File | Role |
|---|---|---|
| Registry | `web/src/app/modules.ts` | `MODULES`: every manifest the web app can render. |
| Registry context | `web/src/app/module-registry.tsx` | `ModuleRegistryProvider` (wraps the app in `main.tsx`) and `useModuleRegistry()`. The shell reads the registry through context because importing `modules.ts` directly would be a cycle: modules import the root route, which imports the shell. |
| Root route | `web/src/app/root-route.tsx` | Root route rendering `Shell`; modules attach their routes to it. |
| Router | `web/src/app/router.tsx` | Builds the route tree (shell pages + each `module.route`). Imports `root-route` first, for the same cycle reason. |

The shell shows registry entries the current user has enabled (from `GET /me/modules`). A module the API knows about but the web registry doesn't still appears on `/modules` (with a generic icon) but has no pages. Adding a module means writing its folder and adding one line to `MODULES`; see [web-overview.md](web-overview.md) for the steps.

---

## 5. Open questions

1. **Module order** in the menu: fixed, or user-arrangeable? (Today: the order the API returns.)
2. **Home cards**: is one summary card per module the right home page, or should Home be something else?
3. ~~**Visual style**~~ **Resolved:** the brand palette in [ui-overview.md](ui-overview.md) (ink `#002421`, teal `#00998E`, mist `#CCFFFC`), in a mostly white, calm, light-only theme. How it maps to UI tokens is in [web-overview.md](web-overview.md).
