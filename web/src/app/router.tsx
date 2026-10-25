// root-route must be imported before anything that pulls in the module registry.
import { rootRoute } from './root-route'

import { createRoute, createRouter } from '@tanstack/react-router'

import { MODULES } from './modules'
import { HomePage } from './pages/HomePage'
import { ManageModulesPage } from './pages/ManageModulesPage'
import { SettingsPage } from './pages/SettingsPage'

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage })

const manageModulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/modules',
  component: ManageModulesPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
})

const routeTree = rootRoute.addChildren([
  homeRoute,
  manageModulesRoute,
  settingsRoute,
  ...MODULES.map((module) => module.route),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
