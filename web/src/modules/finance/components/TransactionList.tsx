import { ChevronRight } from 'lucide-react'

import { cn } from '@/shared/lib/cn'
import { formatShortDate } from '@/shared/lib/dates'
import { formatMoney } from '@/shared/lib/money'

import type { BudgetTransaction } from '../api'

/** A budget's transactions, one row per allocation; tapping a row opens it. */
export function TransactionList({
  transactions,
  onOpen,
  showItem = true,
}: {
  transactions: BudgetTransaction[]
  onOpen: (transaction: BudgetTransaction) => void
  /** Hide the item name when every row is for the same item. */
  showItem?: boolean
}) {
  return (
    <ul className="divide-y divide-border">
      {transactions.map((t) => (
        <li key={`${t.id}-${t.budget_item_id}`}>
          <button
            type="button"
            onClick={() => onOpen(t)}
            className="flex w-full items-center gap-3 py-2.5 pr-3 pl-4 text-left transition hover:bg-highlight"
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2">
                <span className="truncate font-medium">{t.payee ?? t.budget_item_name}</span>
                {t.status === 'pending' && (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                    Pending
                  </span>
                )}
              </p>
              <p className="truncate text-sm text-muted">
                {[showItem && t.budget_item_name, formatShortDate(t.occurred_on), t.notes]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <span
              className={cn(
                'shrink-0 font-semibold',
                t.kind === 'income' && 'text-primary',
                t.status === 'pending' && 'text-muted',
              )}
            >
              {t.kind === 'income' ? '+' : '−'}
              {formatMoney(t.allocated_amount)}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted" />
          </button>
        </li>
      ))}
    </ul>
  )
}
