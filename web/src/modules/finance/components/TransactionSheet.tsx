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

import { type Budget, type BudgetItem, type Kind, useCreateTransaction } from '../api'
import { ordinal } from './ItemSheet'

type BudgetContext = Pick<Budget, 'name' | 'period_start' | 'period_end'>

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

function TransactionForm({
  budget,
  items,
  defaultItem,
  onDone,
}: {
  budget: BudgetContext
  items: BudgetItem[]
  defaultItem?: BudgetItem
  onDone: () => void
}) {
  const me = useMe()
  const create = useCreateTransaction()
  const today = todayIn(me.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)

  const [kind, setKind] = useState<Kind>(defaultItem?.kind ?? 'expense')
  // Paying an open checklist item: start from what's left to reach its plan.
  const remaining = defaultItem?.is_checklist_item && !defaultItem.checklist_done
    ? Number(defaultItem.planned_amount) - Number(defaultItem.actual_amount)
    : 0
  const [amount, setAmount] = useState(remaining > 0 ? remaining.toFixed(2) : '')
  const [occurredOn, setOccurredOn] = useState(today)
  const [itemId, setItemId] = useState(defaultItem?.id ?? '')
  const [payee, setPayee] = useState('')
  const [notes, setNotes] = useState('')
  const [invalid, setInvalid] = useState<string | null>(null)

  const item = items.find((i) => i.id === itemId)
  // An income transaction on an expense item (or vice versa) is a credit against it.
  const isCredit = item !== undefined && item.kind !== kind

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const value = parseMoneyInput(amount)
    if (value === null || Number(value) === 0) return setInvalid('Enter an amount like 12.50')
    setInvalid(null)
    create.mutate(
      {
        kind,
        amount: value,
        occurred_on: occurredOn,
        payee: payee.trim() || null,
        notes: notes.trim() || null,
        allocations: itemId ? [{ budget_item_id: itemId, amount: value }] : [],
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
            <p className="text-xs font-medium tracking-wide text-muted uppercase">Logging to</p>
            <p className="truncate font-semibold">{budget.name}</p>
            <p className="text-sm text-muted">{formatDateRange(budget.period_start, budget.period_end)}</p>
          </div>
        </div>
        {item?.is_checklist_item && item.checklist_day && (
          <div className="flex items-center gap-3 border-t border-border pt-2 text-sm">
            <ListChecks className="size-5 shrink-0 text-accent" />
            <span>
              Checklist item <span className="font-semibold">{item.name}</span>, due the{' '}
              {ordinal(item.checklist_day)} ({formatShortDate(dueOn(budget, item.checklist_day))}).{' '}
              {item.checklist_done
                ? 'Already done.'
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
          autoFocus
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

      {(invalid || create.isError) && (
        <p className="text-sm text-red-700">{invalid ?? errorMessage(create.error)}</p>
      )}

      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? 'Saving…' : 'Log transaction'}
      </Button>
    </form>
  )
}

/** The checklist due date within the budget's month. */
function dueOn(budget: BudgetContext, day: number): string {
  return `${budget.period_start.slice(0, 8)}${String(day).padStart(2, '0')}`
}
