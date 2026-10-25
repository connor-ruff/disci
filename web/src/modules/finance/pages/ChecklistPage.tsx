import { CircleCheck, CircleDashed, ListChecks } from 'lucide-react'
import { useState } from 'react'

import { useMe } from '@/shared/api/hooks'
import { cn } from '@/shared/lib/cn'
import { formatShortDate, todayIn } from '@/shared/lib/dates'
import { formatMoney } from '@/shared/lib/money'
import { Card } from '@/shared/ui/card'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'

import { type ChecklistItem, useBudget, useChecklist } from '../api'
import { TransactionSheet } from '../components/TransactionSheet'

export function ChecklistPage() {
  const checklist = useChecklist()
  const me = useMe()
  const today = todayIn(me.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [paying, setPaying] = useState<ChecklistItem | null>(null)

  const items = checklist.data ?? []
  const done = items.filter((i) => i.done).length
  // Usually one monthly budget; if several cover this month, label rows with theirs.
  const multipleBudgets = new Set(items.map((i) => i.budget_id)).size > 1

  return (
    <>
      <PageHeader
        title="Checklist"
        description={
          items.length > 0
            ? `${done} of ${items.length} done this month`
            : "This month's bills and must-dos from your monthly budget."
        }
      />

      {checklist.isPending && <LoadingState />}
      {checklist.isError && <ErrorState error={checklist.error} />}
      {checklist.data?.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <ListChecks className="size-10 text-accent" />
          <h2 className="text-lg font-semibold">No checklist items this month</h2>
          <p className="max-w-sm text-muted">
            In this month's budget, open an item and turn on "On the monthly checklist" with the day it's due.
          </p>
        </Card>
      )}

      {items.length > 0 && (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const overdue = !item.done && item.due_on < today
              return (
                <li key={item.item_id}>
                  <button
                    type="button"
                    disabled={item.done}
                    onClick={() => setPaying(item)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition enabled:hover:bg-highlight"
                  >
                    {item.done ? (
                      <CircleCheck className="size-6 shrink-0 text-accent" />
                    ) : (
                      <CircleDashed className={cn('size-6 shrink-0 text-muted', overdue && 'text-amber-600')} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate font-medium', item.done && 'text-muted line-through')}>
                        {item.item_name}
                      </p>
                      <p className={cn('text-sm text-muted', overdue && 'text-amber-700')}>
                        {item.done
                          ? `Done${item.last_payment_on ? ` ${formatShortDate(item.last_payment_on)}` : ''}`
                          : `${overdue ? 'Overdue · was due' : 'Due'} ${formatShortDate(item.due_on)}`}
                        {!item.done && Number(item.actual_amount) !== 0 &&
                          ` · paid ${formatMoney(item.actual_amount)} so far`}
                        {multipleBudgets && ` · ${item.budget_name}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm text-muted">{formatMoney(item.planned_amount)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {paying && <PaySheet item={paying} onClose={() => setPaying(null)} />}
    </>
  )
}

/** Logs a transaction against a checklist item, pre-filled to tick it off. */
function PaySheet({ item, onClose }: { item: ChecklistItem; onClose: () => void }) {
  const budget = useBudget(item.budget_id)
  const budgetItem = budget.data?.items.find((i) => i.id === item.item_id)
  if (!budget.data || !budgetItem) return null
  return (
    <TransactionSheet
      budget={budget.data}
      items={budget.data.items}
      defaultItem={budgetItem}
      title={`Check off ${budgetItem.name}`}
      open
      onOpenChange={(open) => !open && onClose()}
    />
  )
}
