import { createRoute } from '@tanstack/react-router'

import { rootRoute } from '@/app/root-route'

import { FinanceOverviewPage } from './pages/FinanceOverviewPage'

const financeBaseRoute = createRoute({ getParentRoute: () => rootRoute, path: 'finance' })

const overviewRoute = createRoute({
  getParentRoute: () => financeBaseRoute,
  path: '/',
  component: FinanceOverviewPage,
})

/** Everything under /finance. */
export const financeRoute = financeBaseRoute.addChildren([overviewRoute])
