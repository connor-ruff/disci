import { createRoute, redirect } from '@tanstack/react-router'

import { rootRoute } from '@/app/root-route'

import { CommonPage } from './pages/CommonPage'
import { ListPage } from './pages/ListPage'

const shoppingBaseRoute = createRoute({ getParentRoute: () => rootRoute, path: 'shopping' })

// /shopping itself lands on the list.
const indexRoute = createRoute({
  getParentRoute: () => shoppingBaseRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/shopping/list' })
  },
})

const listRoute = createRoute({ getParentRoute: () => shoppingBaseRoute, path: 'list', component: ListPage })
const commonRoute = createRoute({ getParentRoute: () => shoppingBaseRoute, path: 'common', component: CommonPage })

/** Everything under /shopping. */
export const shoppingRoute = shoppingBaseRoute.addChildren([indexRoute, listRoute, commonRoute])
