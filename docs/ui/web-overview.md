# Web App Overview

*Status: **shell implemented and deployed** to S3 + CloudFront (https://d2j30iivfr2al9.cloudfront.net) with Cognito sign-in. The shell pages (Home, Manage modules, Settings) work; the finance module has its first slice (budgets list, new budget, budget page with items and transactions, categories; see [finance-ui.md](finance-ui.md)). Deploying: [deployment.md](../ops/deployment.md).*

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
| API client | **openapi-fetch**, types from **openapi-typescript** | See §3. |
| Auth | **oidc-client-ts** + **react-oidc-context** | Cognito hosted login, code + PKCE. See §8. |

---

## 2. Folder layout

```
web/
├── index.html                     # viewport-fit=cover, single theme-color (#f8faf9)
├── package.json / package-lock.json
├── tsconfig.json                  # strict; `@/*` → `src/*`
├── vite.config.ts                 # React + Tailwind plugins, /api proxy to :8000
└── src/
    ├── main.tsx                   # AuthGate, QueryClient, ModuleRegistryProvider, RouterProvider
    ├── vite-env.d.ts              # types for the VITE_* build-time env vars (§8)
    ├── index.css                  # Tailwind import + theme tokens (§5)
    ├── app/                       # the shell (see app-shell.md)
    │   ├── module.ts              # ModuleManifest type
    │   ├── modules.ts             # MODULES registry
    │   ├── module-registry.tsx    # registry React context
    │   ├── root-route.tsx         # root route → Shell, NotFound
    │   ├── router.tsx             # route tree: shell pages, /auth/callback, each module's route
    │   ├── AuthGate.tsx           # renders the app only when signed in (cognito mode)
    │   ├── Shell.tsx              # top bar, sub-nav, disabled-module gate
    │   ├── ModuleMenu.tsx         # ☰ drawer
    │   └── pages/                 # Home, ManageModules, Settings, NotFound
    ├── shared/                    # used by the shell and every module
    │   ├── api/
    │   │   ├── client.ts          # typed `api` client, `unwrap`, `ApiError`, `errorMessage`, type aliases
    │   │   ├── hooks.ts           # TanStack Query hooks for core endpoints + queryKeys
    │   │   └── schema.d.ts        # GENERATED from the API's OpenAPI spec (never edit)
    │   ├── auth/auth.ts           # authMode, UserManager, getIdToken, signOut, handleUnauthorized
    │   ├── ui/                    # button, card, drawer, switch, page (header/loading/error),
    │   │                          # sheet (bottom-sheet form panel), field (Field + inputClasses), segmented
    │   └── lib/                   # cn.ts, money.ts (formatMoney, parseMoneyInput),
    │                              # dates.ts (todayIn, formatShortDate, formatDateRange)
    └── modules/
        └── finance/
            ├── index.ts           # the module's ModuleManifest (sub-nav: Budgets, Categories)
            ├── routes.tsx         # route tree under /finance
            ├── api.ts             # TanStack Query hooks + financeKeys
            ├── pages/             # BudgetsPage, NewBudgetPage, BudgetPage, CategoriesPage
            └── components/        # FinanceHomeCard, ItemSheet, TransactionSheet
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

**Auth header.** A middleware on `api` attaches `Authorization: Bearer <ID token>` when signed in (nothing in dev mode), and a **401** response starts a fresh sign-in (see §8).

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
- A module's hooks live in that module's folder (e.g. `modules/finance/api.ts`, keys in `financeKeys`), with keys starting with the module key (e.g. `['finance', ...]`).
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

**Cards** (`shared/ui/card.tsx`) are `rounded-2xl` on `bg-surface` with a `border-border` outline and a very faint shadow.

---

## 6. Mobile-first conventions

The app will mostly be used on phones, so:

- **Touch targets are at least 44 px** (`h-11` / `size-11` on buttons, icon buttons, inputs and the account icon; menu rows are 48 px).
- **Native form controls** where possible (`<select>`, `type="date"`, `inputMode="decimal"` for amounts), so phones show their own pickers. Avoid `type="month"`: desktop Safari doesn't support it and shows a free-text field, so use Month and Year selects instead. Shared `Field` (label + optional hint) and `inputClasses` in `shared/ui/field.tsx`; `Segmented` (`shared/ui/segmented.tsx`) for small either/or choices like Expense / Income.
- **Forms open in a `Sheet`** (`shared/ui/sheet.tsx`, Radix Dialog): it slides up from the bottom on phones (max 90% of the screen height, safe-area padding) and is a centred dialog from `sm` up. Inputs use `text-base` (16 px) so iOS doesn't zoom on focus.
- **Safe-area insets**: `viewport-fit=cover` in `index.html`, with `env(safe-area-inset-*)` padding on the top bar, drawer and page bottom for notched phones.
- **Full-height drawer** for the module menu (`w-72`, at most 85% of the screen width).
- **Sub-nav scrolls sideways** instead of wrapping. A tab is active when the URL **starts with** its path (prefix match, not exact), so Budgets stays highlighted on `/finance/budgets/<id>`.
- `min-h-dvh` for the page frame (handles mobile browser chrome), and the tap highlight is turned off.
- **Dates** a user picks or defaults to are calendar dates in the user's timezone: `todayIn(me.timezone)` (`shared/lib/dates.ts`), and API dates are formatted without timezone conversion (`formatShortDate`, `formatDateRange`).
- Design at phone width first; wider screens get a centred `max-w-3xl` column and, on Home, a two-column card grid.

---

## 7. Adding a module (web side)

The API side comes first (registry entry, migration, endpoints; see [api-overview.md](../api/api-overview.md)), then:

1. Run `make web-api-types` so the new endpoints are in `schema.d.ts`.
2. Create `src/modules/<key>/` with:
   - `routes.tsx`: a base route `createRoute({ getParentRoute: () => rootRoute, path: '<key>' })` plus child routes, exported as one tree.
   - `pages/` and `components/`, including a `HomeCard` component.
   - `api.ts`: the module's TanStack Query hooks (keys start with `'<key>'`).
   - `index.ts`: `export const <key>Module: ModuleManifest = { key, icon, route, subNav, HomeCard }`. `key` must match the API module key.
3. Add the manifest to `MODULES` in `src/app/modules.ts`.

The shell then picks it up automatically: menu entry, manage-modules icon, sub-nav, Home card and the disabled-module gate. The module's name and description come from the API.

---

## 8. Auth

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

## 9. Local development

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
| `make web-check` | Type-check (`tsc --noEmit`) and production-build (`vite build` → `web/dist/`). CI runs it on every push and PR. This build uses dev auth; the real production build is done by `scripts/deploy.sh` (§8). |

---

## 10. Adding dependencies (supply-chain caution)

New packages are installed **only at versions published at least two weeks ago**, so a freshly compromised release has time to be caught before it reaches this repo:

```
cd web && npm install <package> --before=<date two weeks ago, e.g. 2026-10-11>
```

`--before` makes npm resolve every version (including transitive ones) as if it were that date. Commit the updated `package-lock.json`; everyone else installs from it with `make web-install` (`npm ci`), which never picks up newer versions.
