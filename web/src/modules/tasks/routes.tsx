import { createRoute, redirect } from '@tanstack/react-router'

import { rootRoute } from '@/app/root-route'

import { AllTasksPage } from './pages/AllTasksPage'
import { TodayPage } from './pages/TodayPage'
import { TypesPage } from './pages/TypesPage'

const tasksBaseRoute = createRoute({ getParentRoute: () => rootRoute, path: 'tasks' })

// /tasks itself lands on today.
const indexRoute = createRoute({
  getParentRoute: () => tasksBaseRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/tasks/today' })
  },
})

const todayRoute = createRoute({ getParentRoute: () => tasksBaseRoute, path: 'today', component: TodayPage })
const allRoute = createRoute({ getParentRoute: () => tasksBaseRoute, path: 'all', component: AllTasksPage })
const typesRoute = createRoute({ getParentRoute: () => tasksBaseRoute, path: 'types', component: TypesPage })

/** Everything under /tasks. */
export const tasksRoute = tasksBaseRoute.addChildren([indexRoute, todayRoute, allRoute, typesRoute])
