// root-route must be imported before anything that pulls in the module registry.
import { rootRoute } from './root-route'

import { createRoute, createRouter, redirect } from '@tanstack/react-router'

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

// Cognito redirects here after sign-in; AuthGate has already handled the code by the
// time the router renders, so just continue home.
const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/callback',
  beforeLoad: () => {
    throw redirect({ to: '/' })
  },
})

const routeTree = rootRoute.addChildren([
  homeRoute,
  manageModulesRoute,
  settingsRoute,
  authCallbackRoute,
  ...MODULES.map((module) => module.route),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
