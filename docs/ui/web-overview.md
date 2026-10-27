# Web App Overview

*Status: **shell implemented and deployed** to S3 + CloudFront (https://d2j30iivfr2al9.cloudfront.net) with Cognito sign-in. The shell pages (Home, Manage modules, Settings) work; the finance module has budgets, categories, the monthly checklist, recurring transactions and the inbox (see [finance-ui.md](finance-ui.md)), the nutrition module has the daily food sheet, history, the food repo and macro goals (see [nutrition-ui.md](nutrition-ui.md)), and the tasks module has Today, All tasks and the Kinds guide (see [tasks-ui.md](tasks-ui.md)). Deploying: [deployment.md](../ops/deployment.md).*

The engineering entry point for the web app (`web/`): stack, layout, conventions and local workflow. What the shell looks like and how modules plug into it is in [app-shell.md](app-shell.md); the brand palette is in [ui-overview.md](ui-overview.md).

---

## 1. Stack

| Concern | Choice | Notes |
|---|---|---|
| UI | **React 19** | |
| Build / dev server | **Vite 8** | `@vitejs/plugin-react`; `@` aliases `src/`. |
| Language | **TypeScript 5.9** | Deliberately **not** TS 7: `openapi-typescript` uses the TS 5 JavaScript compiler API, which TS 7 (the native Go port) doesn't provide. |
| Routing | **TanStack Router**, code-based routes | Routes are built in code (`createRoute`), no file-based codegen. Typed links. |
| Server state | **TanStack Query** | Defaults in `main.tsx`: `staleTime` 30 s, `retry` 1. |
| Styling | **Tailwind CSS v4** via `@tailwindcss/vite` | No `tailwind.config`; tokens are declared in `src/index.css` with `@theme inline`. |
| Components | **radix-ui** primitives + hand-written shadcn-style components in `src/shared/ui/` | Radix Dialog (drawer, sheet) and Switch so far. Not the shadcn CLI. `cn()` (`clsx` + `tailwind-merge`) merges classes. |
| Icons | **lucide-react** | |
| Drag and drop | **@dnd-kit** (`core`, `sortable`, `utilities`) | Only used through the shared `SortableList` (§6). Touch, mouse and keyboard sensors. |
| API client | **openapi-fetch**, types from **openapi-typescript** | See §3. |
| Auth | **oidc-client-ts** + **react-oidc-context** | Cognito hosted login, code + PKCE. See §9. |

---

## 2. Folder layout

```
web/
├── index.html                     # viewport-fit=cover, single theme-color (#f8faf9), manifest + icons (§7)
├── public/                        # copied as-is to the build root (§7)
│   ├── manifest.json              # web app manifest (name, standalone display, icons)
│   ├── icon.svg                   # app icon, rounded; the browser favicon
│   └── apple-touch-icon.png, icon-192.png, icon-512.png   # full-bleed PNGs for home screens
├── package.json / package-lock.json
├── tsconfig.json                  # strict; `@/*` → `src/*`
├── vite.config.ts                 # React + Tailwind plugins, /api proxy to :8000
└── src/
    ├── main.tsx                   # AuthGate, QueryClient, ModuleRegistryProvider, RouterProvider
    ├── vite-env.d.ts              # types for the VITE_* build-time env vars (§9)
    ├── index.css                  # Tailwind import + theme tokens (§5)
    ├── app/                       # the shell (see app-shell.md)
    │   ├── module.ts              # ModuleManifest type (incl. optional SettingsPanel)
    │   ├── modules.ts             # MODULES registry
    │   ├── module-registry.tsx    # registry React context
    │   ├── root-route.tsx         # root route → Shell, NotFound
    │   ├── router.tsx             # route tree: shell pages, /auth/callback, each module's route
    │   ├── AuthGate.tsx           # renders the app only when signed in (cognito mode)
    │   ├── Shell.tsx              # top bar, sub-nav, disabled-module gate
    │   ├── PullToRefresh.tsx      # pull-down-to-reload in the home-screen app (§7)
    │   ├── ModuleMenu.tsx         # ☰ drawer
    │   └── pages/                 # Home, ManageModules, Settings (+ module SettingsPanels), NotFound
    ├── shared/                    # used by the shell and every module
    │   ├── api/
    │   │   ├── client.ts          # typed `api` client, `unwrap`, `ApiError`, `errorMessage`, type aliases
    │   │   ├── hooks.ts           # TanStack Query hooks for core endpoints + queryKeys
    │   │   └── schema.d.ts        # GENERATED from the API's OpenAPI spec (never edit)
    │   ├── auth/auth.ts           # authMode, UserManager, getIdToken, signOut, handleUnauthorized
    │   ├── ui/                    # button, card, drawer, switch, page (header/loading/error),
    │   │                          # sheet (bottom-sheet form panel), field (Field + inputClasses), segmented,
    │   │                          # checkbox (Checkbox), sortable (SortableList: drag-to-reorder),
    │   │                          # module-card (ModuleCard + Meter for Home cards)
    │   └── lib/                   # cn.ts, money.ts (formatMoney, parseMoneyInput),
    │                              # dates.ts (todayIn, formatShortDate, formatDateRange, addDays, formatLongDate)
    └── modules/
        ├── finance/
        │   ├── index.ts           # the module's ModuleManifest (sub-nav: Budgets, Checklist, Recurring, Inbox, Categories)
        │   ├── routes.tsx         # route tree under /finance
        │   ├── api.ts             # TanStack Query hooks + financeKeys
        │   ├── pages/             # BudgetsPage, NewBudgetPage, BudgetPage, CategoriesPage,
        │   │                      # ChecklistPage, RecurringPage, InboxPage
        │   └── components/        # FinanceHomeCard, ActiveBadge, ItemSheet, TransactionSheet,
        │                          # RecurringSheet, ReorderToggle
        ├── nutrition/
        │   ├── index.ts           # ModuleManifest (sub-nav: Daily, History, Food repo, Goals; SettingsPanel)
        │   ├── routes.tsx         # route tree under /nutrition
        │   ├── api.ts             # TanStack Query hooks + nutritionKeys
        │   ├── format.ts          # formatNutrient, formatQuantity, describeServing, UNIT_SUGGESTIONS
        │   ├── pages/             # DailyPage, DayPage, HistoryPage, FoodsPage, GoalsPage
        │   └── components/        # DaySheet, LogSheet, FoodForm, NutritionSettings, NutritionHomeCard
        └── tasks/
            ├── index.ts           # ModuleManifest (sub-nav: Today, All tasks, Kinds)
            ├── routes.tsx         # route tree under /tasks
            ├── api.ts             # TanStack Query hooks + tasksKeys
            ├── format.ts          # TYPE_LABELS, TYPE_ORDER, UNITS, describeCadence, describeDue
            ├── pages/             # TodayPage, AllTasksPage, TypesPage
            └── components/        # TaskRow (+ check control), Section, TaskSheet, NewTaskButton, TasksHomeCard
```

**Rule of thumb:** `app/` is the shell, `shared/` is anything two or more places use, and `modules/<key>/` holds everything specific to one module. A module may import from `shared/` and `app/` (its manifest type, the root route); `shared/` never imports from a module.

---

## 3. API client and types

- `src/shared/api/schema.d.ts` is **generated** by `openapi-typescript` from the running API's `/openapi.json`. Regenerate it with `make web-api-types` (needs `make api` running) whenever the API's endpoints or Pydantic models change, and commit the result. **Never edit it by hand.**
- `src/shared/api/client.ts` exports `api`, an `openapi-fetch` client typed against that schema, so paths, params and request/response bodies are type-checked. It also exports friendly aliases for schema types (`User`, `UserUpdate`, `ModuleInfo`).
- `unwrap(result)` turns openapi-fetch's `{ data, error }` into a value or a thrown `ApiError` (with `status` and `body`), which is what TanStack Query expects.
- `errorMessage(error)` gives a human-readable message for a failed request: the API's `detail` string when there is one (e.g. "already exists"), "Please check the values entered." for other 422s, otherwise the error's message. Forms show it under the submit button.
- **Money** comes from the API as a decimal string (`"283.55"`). Display it with `formatMoney` and parse user input with `parseMoneyInput` (`shared/lib/money.ts`), which returns a clean decimal string or `null`; send that string back rather than a float.

**Base URL.** `import.meta.env.VITE_API_URL ?? '/api'`.

| | Where the browser sends requests |
|---|---|
| Local | `/api/...` on the Vite dev server (:5173), which proxies to `http://localhost:8000` and strips the `/api` prefix. Same origin, so no CORS. |
| Production | `VITE_API_URL` (set at build time) points at API Gateway. |

**Auth header.** A middleware on `api` attaches `Authorization: Bearer <ID token>` when signed in (nothing in dev mode), and a **401** response starts a fresh sign-in (see §9).

---

## 4. Data fetching conventions

- Components never call `api` directly; they use a hook. Hooks for core endpoints live in `src/shared/api/hooks.ts`:

| Hook | Endpoint | Cache behaviour |
|---|---|---|
| `useMe()` | `GET /me` | key `['me']` |
| `useUpdateMe()` | `PUT /me` | writes the returned user into `['me']` |
| `useModules()` | `GET /me/modules` | key `['me', 'modules']` |
| `useSetModuleEnabled()` | `PUT` / `DELETE /me/modules/{key}` | invalidates `['me', 'modules']` |

- **Query keys** are defined once, in the `queryKeys` object, never as inline arrays. Keys are hierarchical (`['me', 'modules']` sits under `['me']`) so a whole branch can be invalidated at once.
- A module's hooks live in that module's folder (e.g. `modules/finance/api.ts`, keys in `financeKeys`; `modules/nutrition/api.ts`, keys in `nutritionKeys`; `modules/tasks/api.ts`, keys in `tasksKeys`), with keys starting with the module key (e.g. `['finance', ...]`).
- Pages handle `isPending` / `isError` with the shared `LoadingState` / `ErrorState` from `shared/ui/page.tsx`.

---

## 5. Theming

The look is **mostly white and calm**: a soft off-white page, white cards, quiet borders, with the brand greens used for accents, buttons and highlights. The app is **light theme only**, by choice, with no theme toggle (`color-scheme: light`, and the single `theme-color` meta in `index.html` is `#f8faf9`).

The brand palette from [ui-overview.md](ui-overview.md) (ink `#002421`, teal `#00998E`, mist `#CCFFFC`) is mapped to **semantic tokens** in `src/index.css`. Components use only the token classes (`bg-background`, `text-muted`, `bg-primary`, ...), never raw hex values.

| Token | Value | Used for |
|---|---|---|
| `background` | `#f8faf9` | Page background (soft off-white) |
| `surface` | `#ffffff` | Cards, drawer |
| `foreground` | `#002421` (ink) | Body text |
| `muted` | `#5a6f6c` | Secondary text |
| `border` | `#e4ecea` | Borders, switch track (off) |
| `primary` | `#00857c` (deeper teal) | Text-bearing (primary) buttons |
| `primary-foreground` | `#ffffff` | Text on primary buttons |
| `accent` | `#00998e` (brand teal) | Icons, switch track (on), active states, focus rings |
| `highlight` | `#ecfaf8` (soft mint) | Hover and selected backgrounds |

**Contrast rule.** Brand teal (`#00998E`) on white is only ~3.4:1, below the 4.5:1 WCAG AA needs for body text, so it is for non-text accents (icons, toggles, active states, focus rings). Buttons with text use the slightly deeper teal `#00857C` with white text, which is 4.6:1 and passes AA.

**Cards** (`shared/ui/card.tsx`) are `rounded-2xl` on `bg-surface` with a `border-border` outline and a very faint shadow. Module Home cards use `ModuleCard` (`shared/ui/module-card.tsx`): icon, title, optional subtitle and summary children, with a hover highlight; each module wraps it in its own `Link`. `Meter` (same file) is a thin progress bar: the ratio is capped at full, and `warn` turns it amber.

---

## 6. Mobile-first conventions

The app will mostly be used on phones, so:

- **Touch targets are at least 44 px** (`h-11` / `size-11` on buttons, icon buttons, inputs and the account icon; menu rows are 48 px).
- **Native form controls** where possible (`<select>`, `type="date"`, `inputMode="decimal"` for amounts), so phones show their own pickers. Avoid `type="month"`: desktop Safari doesn't support it and shows a free-text field, so use Month and Year selects instead. Shared `Field` (label + optional hint) and `inputClasses` in `shared/ui/field.tsx`; `Segmented` (`shared/ui/segmented.tsx`) for small either/or choices like Expense / Income (optional `size="sm"`, `h-8` and `text-xs`, fits three or more short labels across a phone, e.g. the budget page's KPI toggle); `Checkbox` (`shared/ui/checkbox.tsx`) for yes/no options: a native checkbox with a label and optional hint, sized for touch.
- **Forms open in a `Sheet`** (`shared/ui/sheet.tsx`, Radix Dialog): it slides up from the bottom on phones (max 90% of the screen height, safe-area padding) and is a centred dialog from `sm` up. Inputs use `text-base` (16 px) so iOS doesn't zoom on focus.
- **Don't autofocus inputs**; the user taps the field. No `autoFocus` on form fields, and `Sheet` sets Radix's `onOpenAutoFocus` to focus the panel itself rather than its first field. On iOS, focusing an input while the sheet is still sliding up raises the keyboard and scrolls to where the input was mid-animation, which leaves the field hidden behind the keyboard.
- **Safe-area insets**: `viewport-fit=cover` in `index.html`, with `env(safe-area-inset-*)` padding on the top bar, drawer and page bottom for notched phones.
- **Reordering lists**: `SortableList` (`shared/ui/sortable.tsx`, on @dnd-kit) renders a vertical list where each row gets a 44 px grip handle; `onReorder` receives the items in their new order after a drop. Touch needs a short press-and-hold (120 ms) so normal scrolling still works; the keyboard works too (focus a handle, Space, arrows, Space). Pages put lists into a separate reorder mode (finance's `ReorderToggle`: Reorder / Done) rather than making rows always draggable, and save each drop with an optimistic cache update.
- **Full-height drawer** for the module menu (`w-72`, at most 85% of the screen width).
- **Sub-nav scrolls sideways** instead of wrapping. A tab is active when the URL **starts with** its path (prefix match, not exact), so Budgets stays highlighted on `/finance/budgets/<id>`.
- `min-h-dvh` for the page frame (handles mobile browser chrome), and the tap highlight is turned off.
- **Dates** a user picks or defaults to are calendar dates in the user's timezone: `todayIn(me.timezone)` (`shared/lib/dates.ts`), and API dates are formatted without timezone conversion (`formatShortDate`, `formatDateRange`, `formatLongDate` for "Sunday, Oct 18, 2026"). Step between days with `addDays(date, n)`, which does calendar math on the `YYYY-MM-DD` string.
- Design at phone width first; wider screens get a centred `max-w-3xl` column and, on Home, a two-column card grid.

---

## 7. Home-screen app (PWA-lite)

Disci can be saved to a phone's home screen (Share → Add to Home Screen on iOS) and then launches full-screen with its own icon, like an app. There is **no service worker and no offline support**; that is intentional for now, so every launch loads the latest deploy from the network.

**Files.**
- `web/public/manifest.json`: `name`/`short_name` "Disci", `display: standalone`, `start_url` `/`, background and theme color `#f8faf9`, and the 192 and 512 px PNG icons with `purpose: "any maskable"`.
- `index.html` links the manifest, the SVG favicon (`icon.svg`) and the `apple-touch-icon`, and sets `apple-mobile-web-app-title` ("Disci"), `apple-mobile-web-app-capable` and `apple-mobile-web-app-status-bar-style` (`default`).
- Vite copies `web/public/` to the root of `dist/`, so `scripts/deploy.sh` uploads these files with the same `no-cache` rule as `index.html` (see [deployment.md](../ops/deployment.md)).

**The icon.** A teal (`#00857C`) tile with a white "D" outline and a mint (`#CCFFFC`) check: discipline, checking things off.
- `icon.svg` has rounded corners (`rx`) and is the browser favicon.
- The PNGs (`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`) are **full-bleed squares**: iOS and Android apply their own rounding and masks, and rendering the rounded SVG left white corners (the PNG renderer fills transparent corners with white).
- To change the icon, edit `icon.svg`, then re-render the PNGs on macOS from a copy of the SVG without `rx` (the full-bleed variant) with `qlmanage -t -s <size> -o <dir> <file>.svg` at each size (180 for the apple-touch-icon, 192, 512).

**Pull-to-refresh** (`app/PullToRefresh.tsx`, rendered by `Shell`). The home-screen app has no reload button, so:
- It is only active in standalone mode (`display-mode: standalone`, or `navigator.standalone` on iOS). Browser tabs have a reload button and their own pull gesture, so it does nothing there.
- Pulling down from the very top of a page, with no dialog or sheet open, shows a "Pull to refresh" pill; past a 70 px (dampened) pull it reads "Release to refresh". Releasing does a full `window.location.reload()`, which reloads data and code and so picks up new deploys.
- `index.css` sets `overscroll-behavior-y: none` in standalone mode so iOS's rubber-band bounce doesn't fight the gesture.

**Existing shortcuts.** A home-screen shortcut saved before this support was added keeps its old icon and opens as a browser tab. To get the new icon and full-screen launch, delete it and add it again with Share → Add to Home Screen.

---

## 8. Adding a module (web side)

The API side comes first (registry entry, migration, endpoints; see [api-overview.md](../api/api-overview.md)), then:

1. Run `make web-api-types` so the new endpoints are in `schema.d.ts`.
2. Create `src/modules/<key>/` with:
   - `routes.tsx`: a base route `createRoute({ getParentRoute: () => rootRoute, path: '<key>' })` plus child routes, exported as one tree.
   - `pages/` and `components/`, including a `HomeCard` component.
   - `api.ts`: the module's TanStack Query hooks (keys start with `'<key>'`).
   - `index.ts`: `export const <key>Module: ModuleManifest = { key, icon, route, subNav, HomeCard }`, plus an optional `SettingsPanel` component for module settings on the Settings page. `key` must match the API module key.
3. Add the manifest to `MODULES` in `src/app/modules.ts`.

The shell then picks it up automatically: menu entry, manage-modules icon, sub-nav, Home card, Settings panel (if any) and the disabled-module gate. The module's name and description come from the API.

---

## 9. Auth

| Mode | `VITE_AUTH_MODE` | Behaviour |
|---|---|---|
| Dev (default) | unset or `dev` | No login. `userManager` is `null`, `AuthGate` renders the app directly, no `Authorization` header is sent; the local API's dev auth acts as the seeded user. |
| Cognito (production) | `cognito` | Real sign-in through Cognito's hosted login page (authorization code + PKCE, public client, no secret). |

**Build-time env vars** (typed in `src/vite-env.d.ts`; baked into the bundle, so none are secret):

| Variable | Meaning |
|---|---|
| `VITE_API_URL` | API base URL. Default `/api` (the dev server proxy). |
| `VITE_AUTH_MODE` | `dev` (default) or `cognito`. |
| `VITE_COGNITO_AUTHORITY` | `https://cognito-idp.<region>.amazonaws.com/<user pool id>` (OIDC issuer). |
| `VITE_COGNITO_CLIENT_ID` | The Cognito web client id. |
| `VITE_COGNITO_DOMAIN` | Hosted login domain, used for `/logout`. |

The three `VITE_COGNITO_*` values are required in `cognito` mode; `auth.ts` throws at startup if one is missing. **The production build is done by `scripts/deploy.sh`**, which reads the values from SSM `/disci/prod/*` and runs `npm run build` with `VITE_AUTH_MODE=cognito`. Don't build production bundles by hand or commit `.env` files with these values.

**How sign-in works (cognito mode):**
- `src/shared/auth/auth.ts` creates one `oidc-client-ts` `UserManager` (scope `openid email profile`, redirect URI `<origin>/auth/callback`). Tokens are stored in **`localStorage`**, so the session survives tabs and restarts, and `automaticSilentRenew` refreshes them with the **refresh token** (valid 30 days; ID/access tokens last 60 minutes).
- `AuthGate` (in `main.tsx`, outside everything else) wraps the app in `react-oidc-context`'s `AuthProvider`. If not signed in it first tries a silent renew with a stored refresh token, otherwise redirects to the hosted login page. While that happens it shows "Signing you in…"; on failure, the error and a **Try again** button.
- Cognito returns to `/auth/callback?code=...`. `AuthProvider` exchanges the code, `onSigninCallback` strips the query string, and the router's `/auth/callback` route redirects to `/`.
- The API client sends the **ID token** (not the access token), because the API needs the `email` claim. API Gateway verifies it before the API runs.
- A **401** from the API (e.g. a revoked token) triggers `signinRedirect()`.
- **Sign out** (button on Settings, cognito mode only) clears the local session and then goes to Cognito's `/logout` (with `client_id` and `logout_uri` = the site root), ending the hosted-login session too.

Cognito login doesn't work from `localhost` (the client's callback URLs are only the CloudFront origin), so local development always uses dev mode.

---

## 10. Local development

**One-time setup:** install Node.js (with npm), then `make web-install`.

Run it with **two terminals**:

```
make api     # terminal 1: API on http://localhost:8000 (starts Postgres, applies migrations)
make web     # terminal 2: web app on http://localhost:5173
```

| Command | What it does |
|---|---|
| `make web-install` | `npm ci`: install the exact versions in `package-lock.json`. |
| `make web` | Vite dev server with hot reload at http://localhost:5173. Needs `make api` running. |
| `make web-api-types` | Regenerate `src/shared/api/schema.d.ts` from the running API. |
| `make web-check` | Type-check (`tsc --noEmit`) and production-build (`vite build` → `web/dist/`). CI runs it on every push and PR. This build uses dev auth; the real production build is done by `scripts/deploy.sh` (§9). |

---

## 11. Adding dependencies (supply-chain caution)

New packages are installed **only at versions published at least two weeks ago**, so a freshly compromised release has time to be caught before it reaches this repo:

```
cd web && npm install <package> --before=<date two weeks ago, e.g. 2026-10-11>
```

`--before` makes npm resolve every version (including transitive ones) as if it were that date. Commit the updated `package-lock.json`; everyone else installs from it with `make web-install` (`npm ci`), which never picks up newer versions.
