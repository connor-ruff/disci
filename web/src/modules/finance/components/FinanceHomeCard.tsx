import { Link } from '@tanstack/react-router'
import { Wallet } from 'lucide-react'
import type { ReactNode } from 'react'

import { useMe } from '@/shared/api/hooks'
import { cn } from '@/shared/lib/cn'
import { todayIn } from '@/shared/lib/dates'
import { formatMoney } from '@/shared/lib/money'
import { Meter, ModuleCard } from '@/shared/ui/module-card'

import { type Budget, useBudget, useBudgets, useInboxToDo } from '../api'
import { InboxBanner } from './InboxAlert'

/**
 * Home card: how much of this month's budgeted expenses is spent. Opens that budget. When
 * the Inbox needs the user, an amber banner at the bottom says so and opens the Inbox.
 */
export function FinanceHomeCard() {
  const inbox = useInboxToDo()
  return (
    // The banner is its own link, so it sits over the card rather than inside its link.
    <div className="relative">
      <BudgetCard>{inbox > 0 && <div aria-hidden className="h-9" />}</BudgetCard>
      <InboxBanner className="absolute right-4 bottom-4 left-4" />
    </div>
  )
}

/** The card itself; `children` goes at the bottom (room for the Inbox banner). */
function BudgetCard({ children }: { children?: ReactNode }) {
  const me = useMe()
  const budgets = useBudgets()
  const today = todayIn(me.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
  // The list is newest first, so this is the most recent monthly budget covering today.
  const active = budgets.data?.find(
    (b) => b.period_type === 'month' && b.period_start <= today && today <= b.period_end,
  )

  if (!active) {
    return (
      <Link to="/finance/budgets" className="block h-full rounded-2xl">
        <ModuleCard
          icon={Wallet}
          title="Finance"
          subtitle={budgets.isPending ? 'Loading…' : 'No budget for this month yet'}
        >
          {children}
        </ModuleCard>
      </Link>
    )
  }
  return (
    <Link to="/finance/budgets/$budgetId" params={{ budgetId: active.id }} className="block h-full rounded-2xl">
      <ModuleCard icon={Wallet} title="Finance" subtitle={active.name}>
        <BudgetSpend budget={active} />
        {children}
      </ModuleCard>
    </Link>
  )
}

function BudgetSpend({ budget }: { budget: Budget }) {
  const detail = useBudget(budget.id)
  if (!detail.data) return <p className="text-sm text-muted">Loading…</p>

  const spent = Number(detail.data.expense.actual)
  const planned = Number(detail.data.expense.planned)
  const ratio = planned > 0 ? spent / planned : spent > 0 ? 1 : 0
  const over = spent > planned

  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-baseline justify-between gap-3">
        <span className={cn('text-2xl font-semibold', over && 'text-amber-700')}>
          {planned > 0 ? `${Math.round(ratio * 100)}%` : formatMoney(spent)}
        </span>
        <span className="text-sm text-muted">{planned > 0 ? 'of budget spent' : 'spent, nothing budgeted'}</span>
      </p>
      <Meter ratio={ratio} warn={over} />
      <p className="text-sm text-muted">
        {formatMoney(spent)} of {formatMoney(planned)}
        {over ? (
          <span className="text-amber-700"> · {formatMoney(spent - planned)} over</span>
        ) : (
          planned > 0 && ` · ${formatMoney(planned - spent)} left`
        )}
      </p>
    </div>
  )
}
