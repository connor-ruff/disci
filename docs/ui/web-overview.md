# Web App Overview

*Status: **shell implemented** in `web/`. The shell pages (Home, Manage modules, Settings) work against the local API; the finance module is a stub (one overview page and a home card). Hosting on S3 + CloudFront comes with the AWS infrastructure.*

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
| Components | **radix-ui** primitives + hand-written shadcn-style components in `src/shared/ui/` | Radix Dialog (drawer) and Switch so far. Not the shadcn CLI. `cn()` (`clsx` + `tailwind-merge`) merges classes. |
| Icons | **lucide-react** | |
| API client | **openapi-fetch**, types from **openapi-typescript** | See §3. |

---

## 2. Folder layout

```
web/
├── index.html                     # viewport-fit=cover, theme-color per light/dark
├── package.json / package-lock.json
├── tsconfig.json                  # strict; `@/*` → `src/*`
├── vite.config.ts                 # React + Tailwind plugins, /api proxy to :8000
└── src/
    ├── main.tsx                   # QueryClient, ModuleRegistryProvider, RouterProvider
    ├── index.css                  # Tailwind import + theme tokens (§5)
    ├── app/                       # the shell (see app-shell.md)
    │   ├── module.ts              # ModuleManifest type
    │   ├── modules.ts             # MODULES registry
    │   ├── module-registry.tsx    # registry React context
    │   ├── root-route.tsx         # root route → Shell, NotFound
    │   ├── router.tsx             # route tree: shell pages + each module's route
    │   ├── Shell.tsx              # top bar, sub-nav, disabled-module gate
    │   ├── ModuleMenu.tsx         # ☰ drawer
    │   └── pages/                 # Home, ManageModules, Settings, NotFound
    ├── shared/                    # used by the shell and every module
    │   ├── api/
    │   │   ├── client.ts          # typed `api` client, `unwrap`, `ApiError`, type aliases
    │   │   ├── hooks.ts           # TanStack Query hooks for core endpoints + queryKeys
    │   │   └── schema.d.ts        # GENERATED from the API's OpenAPI spec (never edit)
    │   ├── ui/                    # button, card, drawer, switch, page (header/loading/error)
    │   └── lib/cn.ts
    └── modules/
        └── finance/
            ├── index.ts           # the module's ModuleManifest
            ├── routes.tsx         # route tree under /finance
            ├── pages/
            └── components/        # e.g. FinanceHomeCard
```

**Rule of thumb:** `app/` is the shell, `shared/` is anything two or more places use, and `modules/<key>/` holds everything specific to one module. A module may import from `shared/` and `app/` (its manifest type, the root route); `shared/` never imports from a module.

---

## 3. API client and types

- `src/shared/api/schema.d.ts` is **generated** by `openapi-typescript` from the running API's `/openapi.json`. Regenerate it with `make web-api-types` (needs `make api` running) whenever the API's endpoints or Pydantic models change, and commit the result. **Never edit it by hand.**
- `src/shared/api/client.ts` exports `api`, an `openapi-fetch` client typed against that schema, so paths, params and request/response bodies are type-checked. It also exports friendly aliases for schema types (`User`, `UserUpdate`, `ModuleInfo`).
- `unwrap(result)` turns openapi-fetch's `{ data, error }` into a value or a thrown `ApiError` (with `status` and `body`), which is what TanStack Query expects.

**Base URL.** `import.meta.env.VITE_API_URL ?? '/api'`.

| | Where the browser sends requests |
|---|---|
| Local | `/api/...` on the Vite dev server (:5173), which proxies to `http://localhost:8000` and strips the `/api` prefix. Same origin, so no CORS. |
| Production | `VITE_API_URL` (set at build time) points at API Gateway. |

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
- A module's hooks will live in that module's folder (e.g. `modules/finance/api.ts`), with keys starting with the module key (e.g. `['finance', ...]`).
- Pages handle `isPending` / `isError` with the shared `LoadingState` / `ErrorState` from `shared/ui/page.tsx`.

---

## 5. Theming

The brand palette from [ui-overview.md](ui-overview.md) (ink `#002421`, teal `#00998E`, mist `#CCFFFC`) is mapped to **semantic tokens** in `src/index.css`. Components use only the token classes (`bg-background`, `text-muted`, `bg-primary`, ...), never raw hex values, so light and dark mode come for free. Dark mode follows the device (`prefers-color-scheme`); there is no in-app toggle.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `background` | `#f6fbfb` | `#002421` (ink) | Page background |
| `surface` | `#ffffff` | `#00302c` | Cards, drawer |
| `foreground` | `#002421` (ink) | `#ccfffc` (mist) | Body text |
| `muted` | `#4d6b68` | `#8fbfbb` | Secondary text |
| `border` | `#d3e5e3` | `#0b4a45` | Borders, switch track (off) |
| `primary` | `#002421` (ink) | `#00998e` (teal) | Text-bearing (primary) buttons |
| `primary-foreground` | `#ccfffc` (mist) | `#002421` (ink) | Text on primary buttons |
| `accent` | `#00998e` (teal) | `#00998e` (teal) | Icons, switch track (on), focus rings, small links |
| `highlight` | `#e3fbf9` | `#003e39` | Hover and active backgrounds |

**Contrast rule.** Teal on white is only ~3.4:1, below the 4.5:1 needed for body text. So teal is for accents (icons, toggles, active states, focus rings), not for text on light backgrounds; buttons with text use an ink background with mist text in light mode, and a teal background with ink text in dark mode.

---

## 6. Mobile-first conventions

The app will mostly be used on phones, so:

- **Touch targets are at least 44 px** (`h-11` / `size-11` on buttons, icon buttons, inputs and the account icon; menu rows are 48 px).
- **Native form controls** where possible, e.g. `<select>` for timezone and week start, so phones show their own pickers. Inputs use `text-base` (16 px) so iOS doesn't zoom on focus.
- **Safe-area insets**: `viewport-fit=cover` in `index.html`, with `env(safe-area-inset-*)` padding on the top bar, drawer and page bottom for notched phones.
- **Full-height drawer** for the module menu (`w-72`, at most 85% of the screen width).
- **Sub-nav scrolls sideways** instead of wrapping.
- `min-h-dvh` for the page frame (handles mobile browser chrome), and the tap highlight is turned off.
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

## 8. Local development

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
| `make web-check` | Type-check (`tsc --noEmit`) and production-build (`vite build` → `web/dist/`). |

---

## 9. Adding dependencies (supply-chain caution)

New packages are installed **only at versions published at least two weeks ago**, so a freshly compromised release has time to be caught before it reaches this repo:

```
cd web && npm install <package> --before=<date two weeks ago, e.g. 2026-10-11>
```

`--before` makes npm resolve every version (including transitive ones) as if it were that date. Commit the updated `package-lock.json`; everyone else installs from it with `make web-install` (`npm ci`), which never picks up newer versions.
