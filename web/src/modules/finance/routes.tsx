import { createRoute, redirect } from '@tanstack/react-router'

import { rootRoute } from '@/app/root-route'

import { BudgetPage } from './pages/BudgetPage'
import { BudgetsPage } from './pages/BudgetsPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { NewBudgetPage } from './pages/NewBudgetPage'

const financeBaseRoute = createRoute({ getParentRoute: () => rootRoute, path: 'finance' })

// /finance itself just lands on the budgets list.
const indexRoute = createRoute({
  getParentRoute: () => financeBaseRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/finance/budgets' })
  },
})

const budgetsRoute = createRoute({
  getParentRoute: () => financeBaseRoute,
  path: 'budgets',
  component: BudgetsPage,
})

const newBudgetRoute = createRoute({
  getParentRoute: () => financeBaseRoute,
  path: 'budgets/new',
  component: NewBudgetPage,
})

export const budgetRoute = createRoute({
  getParentRoute: () => financeBaseRoute,
  path: 'budgets/$budgetId',
  component: BudgetPage,
})

const categoriesRoute = createRoute({
  getParentRoute: () => financeBaseRoute,
  path: 'categories',
  component: CategoriesPage,
})

/** Everything under /finance. */
export const financeRoute = financeBaseRoute.addChildren([
  indexRoute,
  budgetsRoute,
  newBudgetRoute,
  budgetRoute,
  categoriesRoute,
])
