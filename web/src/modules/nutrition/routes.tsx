import { createRoute, redirect } from '@tanstack/react-router'

import { rootRoute } from '@/app/root-route'

import { DailyPage } from './pages/DailyPage'
import { DayPage } from './pages/DayPage'
import { FoodsPage } from './pages/FoodsPage'
import { GoalsPage } from './pages/GoalsPage'
import { HistoryPage } from './pages/HistoryPage'

const nutritionBaseRoute = createRoute({ getParentRoute: () => rootRoute, path: 'nutrition' })

// /nutrition itself lands on today's sheet.
const indexRoute = createRoute({
  getParentRoute: () => nutritionBaseRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/nutrition/daily' })
  },
})

const dailyRoute = createRoute({
  getParentRoute: () => nutritionBaseRoute,
  path: 'daily',
  component: DailyPage,
})

const historyRoute = createRoute({
  getParentRoute: () => nutritionBaseRoute,
  path: 'history',
  component: HistoryPage,
})

const dayRoute = createRoute({
  getParentRoute: () => nutritionBaseRoute,
  path: 'history/$date',
  component: DayPage,
})

const foodsRoute = createRoute({
  getParentRoute: () => nutritionBaseRoute,
  path: 'foods',
  component: FoodsPage,
})

const goalsRoute = createRoute({
  getParentRoute: () => nutritionBaseRoute,
  path: 'goals',
  component: GoalsPage,
})

/** Everything under /nutrition. */
export const nutritionRoute = nutritionBaseRoute.addChildren([
  indexRoute,
  dailyRoute,
  historyRoute,
  dayRoute,
  foodsRoute,
  goalsRoute,
])
