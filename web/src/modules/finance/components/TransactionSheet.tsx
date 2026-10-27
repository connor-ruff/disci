import { ListChecks, Wallet } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { errorMessage } from '@/shared/api/client'
import { useMe } from '@/shared/api/hooks'
import { formatDateRange, formatShortDate, todayIn } from '@/shared/lib/dates'
import { formatMoney, parseMoneyInput } from '@/shared/lib/money'
import { Button } from '@/shared/ui/button'
import { Field, inputClasses } from '@/shared/ui/field'
import { Segmented } from '@/shared/ui/segmented'
import { Sheet } from '@/shared/ui/sheet'

import {
  type Budget,
  type BudgetItem,
  type Kind,
  type TransactionDetail,
  useCreateTransaction,
  useUpdateTransaction,
} from '../api'
import { ordinal } from './ItemSheet'

export type BudgetContext = Pick<Budget, 'id' | 'name' | 'period_start' | 'period_end'>

type TransactionSheetProps = {
  /** The budget being logged into, shown prominently so it's clear what's affected. */
  budget: BudgetContext
  items: BudgetItem[]
  /** Pre-selects this item (e.g. opened from an item or the checklist). */
  defaultItem?: BudgetItem
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
}

export function TransactionSheet({
  budget,
  items,
  defaultItem,
  open,
  onOpenChange,
  title = 'Log transaction',
}: TransactionSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      <TransactionForm
        key={`${open}-${defaultItem?.id ?? ''}`}
        budget={budget}
        items={items}
        defaultItem={defaultItem}
        onDone={() => onOpenChange(false)}
      />
    </Sheet>
  )
}

/** Logs a new transaction, or edits `transaction` when given. */
export function TransactionForm({
  budget,
  items,
  defaultItem,
  transaction,
  onDone,
}: {
  budget: BudgetContext
  items: BudgetItem[]
  defaultItem?: BudgetItem
  transaction?: TransactionDetail
  onDone: () => void
}) {
  const me = useMe()
  const create = useCreateTransaction()
  const update = useUpdateTransaction()
  const mutation = transaction ? update : create
  const today = todayIn(me.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)

  // Editing: where it counts in this budget, and in any others (kept as they are).
  const here = transaction?.allocations.filter((a) => a.budget_id === budget.id) ?? []
  const elsewhere = transaction?.allocations.filter((a) => a.budget_id !== budget.id) ?? []

  const [kind, setKind] = useState<Kind>(transaction?.kind ?? defaultItem?.kind ?? 'expense')
  // Paying an open checklist item: start from what's left to reach its plan.
  const remaining = defaultItem?.is_checklist_item && !defaultItem.checklist_done
    ? Number(defaultItem.planned_amount) - Number(defaultItem.actual_amount)
    : 0
  const [amount, setAmount] = useState(
    transaction ? String(Number(transaction.amount)) : remaining > 0 ? remaining.toFixed(2) : '',
  )
  const [occurredOn, setOccurredOn] = useState(transaction?.occurred_on ?? today)
  const [itemId, setItemId] = useState(here[0]?.budget_item_id ?? defaultItem?.id ?? '')
  const [payee, setPayee] = useState(transaction?.payee ?? '')
  const [notes, setNotes] = useState(transaction?.notes ?? '')
  const [invalid, setInvalid] = useState<string | null>(null)

  const item = items.find((i) => i.id === itemId)
  // An income transaction on an expense item (or vice versa) is a credit against it.
  const isCredit = item !== undefined && item.kind !== kind

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const value = parseMoneyInput(amount)
    if (value === null || Number(value) === 0) return setInvalid('Enter an amount like 12.50')
    setInvalid(null)
    const fields = {
      kind,
      amount: value,
      occurred_on: occurredOn,
      payee: payee.trim() || null,
      notes: notes.trim() || null,
    }
    const allocations = itemId ? [{ budget_item_id: itemId, amount: value }] : []
    if (!transaction) return create.mutate({ ...fields, allocations }, { onSuccess: onDone })
    // Other budgets keep counting it: in full if they did, else capped at the new amount.
    const inFull = (a: { amount: string }) =>
      Number(a.amount) === Number(transaction.amount) || Number(a.amount) > Number(value)
    const kept = elsewhere.map((a) => ({ budget_item_id: a.budget_item_id, amount: inFull(a) ? value : a.amount }))
    update.mutate(
      {
        id: transaction.id,
        ...fields,
        description: transaction.description,
        allocations: [...allocations, ...kept],
      },
      { onSuccess: onDone },
    )
  }

  const incomeItems = items.filter((i) => i.kind === 'income')
  const expenseItems = items.filter((i) => i.kind === 'expense')

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-highlight p-3">
        <div className="flex items-start gap-3">
          <Wallet className="mt-0.5 size-5 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">
              {transaction ? 'In budget' : 'Logging to'}
            </p>
            <p className="truncate font-semibold">{budget.name}</p>
            <p className="text-sm text-muted">{formatDateRange(budget.period_start, budget.period_end)}</p>
          </div>
        </div>
        {elsewhere.length > 0 && (
          <p className="border-t border-border pt-2 text-sm text-muted">
            Also counts in {elsewhere.map((a) => `${a.budget_name} (${a.budget_item_name})`).join(', ')}.
            A new amount applies there too.
          </p>
        )}
        {item?.is_checklist_item && item.checklist_day && (
          <div className="flex items-center gap-3 border-t border-border pt-2 text-sm">
            <ListChecks className="size-5 shrink-0 text-accent" />
            <span>
              Checklist item <span className="font-semibold">{item.name}</span>, due the{' '}
              {ordinal(item.checklist_day)} ({formatShortDate(dueOn(budget, item.checklist_day))}).{' '}
              {item.checklist_done
                ? 'Already done.'
                : item.checklist_mode === 'any_payment'
                  ? 'Done once any payment is logged.'
                  : `Paid ${formatMoney(item.actual_amount)} of ${formatMoney(item.planned_amount)}; done once it reaches the plan.`}
            </span>
          </div>
        )}
      </div>

      <Segmented
        label="Transaction type"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
        ]}
      />

      <Field label="Amount" htmlFor="txn-amount">
        <input
          id="txn-amount"
          inputMode="decimal"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className={inputClasses + ' text-lg font-semibold'}
        />
      </Field>

      <Field
        label="Budget item"
        htmlFor="txn-item"
        hint={isCredit ? `Counts as a credit against ${item.name} (e.g. a refund or rebate).` : undefined}
      >
        <select id="txn-item" value={itemId} onChange={(e) => setItemId(e.target.value)} className={inputClasses}>
          <option value="">Don't assign yet</option>
          {incomeItems.length > 0 && (
            <optgroup label="Income">
              {incomeItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </optgroup>
          )}
          {expenseItems.length > 0 && (
            <optgroup label="Expenses">
              {expenseItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </Field>

      <Field label="Date" htmlFor="txn-date">
        <input
          id="txn-date"
          type="date"
          required
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
          className={inputClasses}
        />
      </Field>

      <Field label="Payee (optional)" htmlFor="txn-payee">
        <input
          id="txn-payee"
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          maxLength={200}
          placeholder={kind === 'income' ? 'e.g. Employer' : 'e.g. Kroger'}
          className={inputClasses}
        />
      </Field>

      <Field label="Notes (optional)" htmlFor="txn-notes">
        <textarea
          id="txn-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
          rows={2}
          className={inputClasses + ' h-auto py-2'}
        />
      </Field>

      {(invalid || mutation.isError) && (
        <p className="text-sm text-red-700">{invalid ?? errorMessage(mutation.error)}</p>
      )}

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Saving…' : transaction ? 'Save' : 'Log transaction'}
      </Button>
    </form>
  )
}

/** The checklist due date within the budget's month. */
function dueOn(budget: BudgetContext, day: number): string {
  return `${budget.period_start.slice(0, 8)}${String(day).padStart(2, '0')}`
}
