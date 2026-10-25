import { Check, Inbox as InboxIcon, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { errorMessage } from '@/shared/api/client'
import { cn } from '@/shared/lib/cn'
import { formatShortDate } from '@/shared/lib/dates'
import { formatMoney, parseMoneyInput } from '@/shared/lib/money'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Field, inputClasses } from '@/shared/ui/field'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'
import { Sheet } from '@/shared/ui/sheet'

import {
  type InboxTransaction,
  useApprove,
  useAssign,
  useBudget,
  useBudgets,
  useInbox,
  useReject,
} from '../api'

export function InboxPage() {
  const inbox = useInbox()
  const [assigning, setAssigning] = useState<InboxTransaction | null>(null)

  const empty = inbox.data && inbox.data.pending.length === 0 && inbox.data.unassigned.length === 0

  return (
    <>
      <PageHeader title="Inbox" description="Transactions that need a decision from you." />
      {inbox.isPending && <LoadingState />}
      {inbox.isError && <ErrorState error={inbox.error} />}
      {empty && (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <InboxIcon className="size-10 text-accent" />
          <h2 className="text-lg font-semibold">All caught up</h2>
          <p className="max-w-sm text-muted">Nothing waiting for approval or a budget.</p>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {!!inbox.data?.pending.length && (
          <Card className="p-0">
            <h2 className="px-4 pt-4 pb-1 text-lg font-semibold">Needs approval</h2>
            <p className="px-4 pb-2 text-sm text-muted">Adjust the amount if the real one differs, then approve.</p>
            <ul className="divide-y divide-border">
              {inbox.data.pending.map((t) => (
                <PendingRow key={t.id} transaction={t} />
              ))}
            </ul>
          </Card>
        )}

        {!!inbox.data?.unassigned.length && (
          <Card className="p-0">
            <h2 className="px-4 pt-4 pb-1 text-lg font-semibold">Not in a budget</h2>
            <p className="px-4 pb-2 text-sm text-muted">Logged, but not counted toward any budget item yet.</p>
            <ul className="divide-y divide-border">
              {inbox.data.unassigned.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2 pr-2 pl-4">
                  <Summary transaction={t} />
                  <Button variant="outline" onClick={() => setAssigning(t)}>
                    Assign
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {assigning && <AssignSheet transaction={assigning} onClose={() => setAssigning(null)} />}
    </>
  )
}

function Summary({ transaction: t }: { transaction: InboxTransaction }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate font-medium">{t.recurring_name ?? t.payee ?? 'Transaction'}</p>
      <p className="truncate text-sm text-muted">
        <span className={cn(t.kind === 'income' && 'text-primary')}>
          {t.kind === 'income' ? '+' : '−'}
          {formatMoney(t.amount)}
        </span>{' '}
        · {formatShortDate(t.occurred_on)}
        {t.notes && ` · ${t.notes}`}
      </p>
    </div>
  )
}

function PendingRow({ transaction: t }: { transaction: InboxTransaction }) {
  const approve = useApprove()
  const reject = useReject()
  const [amount, setAmount] = useState(String(Number(t.amount)))
  const parsed = parseMoneyInput(amount)
  const busy = approve.isPending || reject.isPending

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <Summary transaction={t} />
      <div className="flex gap-2">
        <input
          aria-label="Amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputClasses + ' w-32'}
        />
        <Button
          className="flex-1"
          disabled={busy || parsed === null || Number(parsed) === 0}
          onClick={() => approve.mutate({ id: t.id, amount: parsed ?? undefined })}
        >
          <Check className="size-5" />
          Approve
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Reject"
          disabled={busy}
          onClick={() => window.confirm("Reject this? It won't be logged.") && reject.mutate(t.id)}
        >
          <X className="size-5 text-red-700" />
        </Button>
      </div>
      {(approve.isError || reject.isError) && (
        <p className="text-sm text-red-700">{errorMessage(approve.error ?? reject.error)}</p>
      )}
    </li>
  )
}

/** Pick a budget (defaulting to one covering the transaction's date) and an item in it. */
function AssignSheet({ transaction: t, onClose }: { transaction: InboxTransaction; onClose: () => void }) {
  const budgets = useBudgets()
  const covering = budgets.data?.find((b) => b.period_start <= t.occurred_on && t.occurred_on <= b.period_end)
  const [pickedBudget, setPickedBudget] = useState<string>()
  const budgetId = pickedBudget ?? covering?.id ?? budgets.data?.[0]?.id ?? ''

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()} title="Assign to a budget">
      <div className="flex flex-col gap-4">
        <Summary transaction={t} />
        <Field label="Budget" htmlFor="assign-budget">
          <select
            id="assign-budget"
            value={budgetId}
            onChange={(e) => setPickedBudget(e.target.value)}
            className={inputClasses}
          >
            {budgets.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        {budgetId ? (
          <ItemPicker key={budgetId} budgetId={budgetId} transaction={t} onDone={onClose} />
        ) : (
          <p className="text-muted">Create a budget first.</p>
        )}
      </div>
    </Sheet>
  )
}

function ItemPicker({
  budgetId,
  transaction: t,
  onDone,
}: {
  budgetId: string
  transaction: InboxTransaction
  onDone: () => void
}) {
  const budget = useBudget(budgetId)
  const assign = useAssign()
  // Prefer the item named like the recurring rule, then any item of the same kind.
  const items = budget.data?.items ?? []
  const guess =
    items.find((i) => t.recurring_name && i.name.toLowerCase() === t.recurring_name.toLowerCase()) ??
    items.find((i) => i.kind === t.kind)
  const [picked, setPicked] = useState<string>()
  const itemId = picked ?? guess?.id ?? ''

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (itemId) assign.mutate({ id: t.id, itemId, amount: t.amount }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Budget item" htmlFor="assign-item">
        <select id="assign-item" value={itemId} onChange={(e) => setPicked(e.target.value)} className={inputClasses}>
          {(['income', 'expense'] as const).map((kind) => (
            <optgroup key={kind} label={kind === 'income' ? 'Income' : 'Expenses'}>
              {items
                .filter((i) => i.kind === kind)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </Field>
      {assign.isError && <p className="text-sm text-red-700">{errorMessage(assign.error)}</p>}
      <Button type="submit" disabled={!itemId || assign.isPending}>
        {assign.isPending ? 'Assigning…' : 'Assign'}
      </Button>
    </form>
  )
}
