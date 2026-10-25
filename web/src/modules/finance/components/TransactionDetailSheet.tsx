import { CalendarDays, Pencil, Repeat, Store, Tag } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { formatShortDate } from '@/shared/lib/dates'
import { cn } from '@/shared/lib/cn'
import { formatMoney } from '@/shared/lib/money'
import { Button } from '@/shared/ui/button'
import { Sheet } from '@/shared/ui/sheet'

import { type BudgetItem, type TransactionDetail, useDeleteTransaction, useTransaction } from '../api'
import { type BudgetContext, TransactionForm } from './TransactionSheet'

type TransactionDetailSheetProps = {
  /** The budget it's opened from; editing picks the item from this budget's items. */
  budget: BudgetContext
  items: BudgetItem[]
  transactionId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** One transaction's facts, with Edit and Delete. */
export function TransactionDetailSheet({ budget, items, transactionId, open, onOpenChange }: TransactionDetailSheetProps) {
  const transaction = useTransaction(transactionId)
  const [editing, setEditing] = useState(false)

  function onOpenChangeAndReset(next: boolean) {
    if (!next) setEditing(false)
    onOpenChange(next)
  }

  const data = transaction.data
  return (
    <Sheet open={open} onOpenChange={onOpenChangeAndReset} title={editing ? 'Edit transaction' : 'Transaction'}>
      {transaction.isPending && <p className="py-6 text-center text-muted">Loading…</p>}
      {transaction.isError && <p className="py-6 text-center text-red-700">Couldn't load this transaction.</p>}
      {data &&
        (editing ? (
          <>
            <TransactionForm
              key={data.id}
              budget={budget}
              items={items}
              transaction={data}
              onDone={() => setEditing(false)}
            />
            <Button variant="ghost" onClick={() => setEditing(false)} className="mt-2 w-full">
              Cancel
            </Button>
          </>
        ) : (
          <TransactionFacts
            transaction={data}
            onEdit={() => setEditing(true)}
            onDeleted={() => onOpenChangeAndReset(false)}
          />
        ))}
    </Sheet>
  )
}

function TransactionFacts({
  transaction: t,
  onEdit,
  onDeleted,
}: {
  transaction: TransactionDetail
  onEdit: () => void
  onDeleted: () => void
}) {
  const remove = useDeleteTransaction()
  const partial = (amount: string) => Number(amount) !== Number(t.amount)

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <p className={cn('text-3xl font-semibold', t.kind === 'income' && 'text-primary')}>
          {t.kind === 'income' ? '+' : '−'}
          {formatMoney(t.amount)}
        </p>
        <p className="mt-1 flex items-center justify-center gap-2 text-sm text-muted">
          {t.kind === 'income' ? 'Income' : 'Expense'}
          {t.status === 'pending' && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">Pending approval</span>
          )}
        </p>
      </div>

      <dl className="divide-y divide-border rounded-lg border border-border">
        <Fact icon={<CalendarDays className="size-4" />} label="Date">
          {formatShortDate(t.occurred_on)}
        </Fact>
        <Fact icon={<Store className="size-4" />} label="Payee">
          {t.payee ?? <span className="text-muted">None</span>}
        </Fact>
        <Fact icon={<Tag className="size-4" />} label="Counts toward">
          {t.allocations.length === 0 ? (
            <span className="text-muted">No budget item (it's in the Inbox)</span>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {t.allocations.map((a) => (
                <li key={a.budget_item_id}>
                  {a.budget_item_name} <span className="text-muted">· {a.budget_name}</span>
                  {partial(a.amount) && <span className="text-muted"> · {formatMoney(a.amount)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Fact>
        {t.recurring_transaction_id && (
          <Fact icon={<Repeat className="size-4" />} label="Source">
            Created by a recurring transaction
          </Fact>
        )}
      </dl>

      {t.notes && (
        <div>
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Notes</p>
          <p className="mt-1 whitespace-pre-wrap">{t.notes}</p>
        </div>
      )}

      <Button onClick={onEdit}>
        <Pencil className="size-4" />
        Edit
      </Button>
      <Button
        variant="ghost"
        className="text-red-700"
        disabled={remove.isPending}
        onClick={() =>
          window.confirm('Delete this transaction? It is removed from every budget.') &&
          remove.mutate(t.id, { onSuccess: onDeleted })
        }
      >
        Delete transaction
      </Button>
    </div>
  )
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <span className="mt-0.5 text-muted">{icon}</span>
      <dt className="w-28 shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm font-medium">{children}</dd>
    </div>
  )
}
