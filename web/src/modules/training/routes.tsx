import { createRoute, redirect } from '@tanstack/react-router'

import { rootRoute } from '@/app/root-route'

import { CalendarPage } from './pages/CalendarPage'
import { HistoryPage } from './pages/HistoryPage'
import { NewPlanPage } from './pages/NewPlanPage'
import { PlanPage } from './pages/PlanPage'

const trainingBaseRoute = createRoute({ getParentRoute: () => rootRoute, path: 'training' })

// /training itself lands on the calendar.
const indexRoute = createRoute({
  getParentRoute: () => trainingBaseRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/training/calendar' })
  },
})

const calendarRoute = createRoute({ getParentRoute: () => trainingBaseRoute, path: 'calendar', component: CalendarPage })
const historyRoute = createRoute({ getParentRoute: () => trainingBaseRoute, path: 'history', component: HistoryPage })

const planRoute = createRoute({ getParentRoute: () => trainingBaseRoute, path: 'plan', component: PlanPage })
const newPlanRoute = createRoute({ getParentRoute: () => trainingBaseRoute, path: 'plan/new', component: NewPlanPage })

/** Everything under /training. */
export const trainingRoute = trainingBaseRoute.addChildren([indexRoute, calendarRoute, historyRoute, planRoute, newPlanRoute])
