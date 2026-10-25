import { Link } from '@tanstack/react-router'
import { ChevronRight, Plus, Wallet } from 'lucide-react'

import { formatDateRange } from '@/shared/lib/dates'
import { buttonClasses } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'

import { useBudgets } from '../api'

const PERIOD_LABELS = { week: 'Weekly', month: 'Monthly', year: 'Yearly' } as const

export function BudgetsPage() {
  const budgets = useBudgets()

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Budgets" />
        <Link to="/finance/budgets/new" className={buttonClasses('primary')}>
          <Plus className="size-5" />
          New
        </Link>
      </div>

      {budgets.isPending && <LoadingState />}
      {budgets.isError && <ErrorState error={budgets.error} />}

      {budgets.data?.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Wallet className="size-10 text-accent" />
          <h2 className="text-lg font-semibold">No budgets yet</h2>
          <p className="max-w-sm text-muted">
            Create one for this month to start planning and logging what you spend.
          </p>
          <Link to="/finance/budgets/new" className={buttonClasses('primary') + ' mt-2'}>
            Create a budget
          </Link>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {budgets.data?.map((budget) => (
          <Link
            key={budget.id}
            to="/finance/budgets/$budgetId"
            params={{ budgetId: budget.id }}
            className="block rounded-2xl"
          >
            <Card className="flex items-center gap-3 transition hover:bg-highlight">
              <div className="flex-1">
                <h2 className="font-semibold">{budget.name}</h2>
                <p className="text-sm text-muted">
                  {PERIOD_LABELS[budget.period_type]} ·{' '}
                  {formatDateRange(budget.period_start, budget.period_end)}
                </p>
              </div>
              <ChevronRight className="size-5 text-muted" />
            </Card>
          </Link>
        ))}
      </div>
    </>
  )
}
