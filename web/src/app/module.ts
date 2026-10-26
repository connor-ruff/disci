import type { AnyRoute } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'

/**
 * What a module registers with the web shell (see docs/ui/app-shell.md §4).
 * A module's display name and description come from the API (GET /me/modules),
 * so they're defined once, in the API's module registry.
 */
export type ModuleManifest = {
  /** Matches the API module key, the Postgres schema and the URL prefix. */
  key: string
  icon: LucideIcon
  /** The module's route tree, mounted at /<key>. */
  route: AnyRoute
  /** Tabs under the top bar. Shown only when a module has more than one section. */
  subNav: { label: string; to: string }[]
  /** Summary card on the Home page. */
  HomeCard: ComponentType
  /** Optional section on the Settings page, shown while the module is enabled. */
  SettingsPanel?: ComponentType
}
