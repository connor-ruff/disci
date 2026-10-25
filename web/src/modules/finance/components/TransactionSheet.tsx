import { type FormEvent, useState } from 'react'

import { errorMessage } from '@/shared/api/client'
import { useMe } from '@/shared/api/hooks'
import { todayIn } from '@/shared/lib/dates'
import { parseMoneyInput } from '@/shared/lib/money'
import { Button } from '@/shared/ui/button'
import { Field, inputClasses } from '@/shared/ui/field'
import { Segmented } from '@/shared/ui/segmented'
import { Sheet } from '@/shared/ui/sheet'

import { type BudgetItem, type Kind, useCreateTransaction } from '../api'

type TransactionSheetProps = {
  items: BudgetItem[]
  /** Pre-selects this item (e.g. opened from an item). */
  defaultItem?: BudgetItem
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TransactionSheet({ items, defaultItem, open, onOpenChange }: TransactionSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Log transaction">
      <TransactionForm
        key={`${open}-${defaultItem?.id ?? ''}`}
        items={items}
        defaultItem={defaultItem}
        onDone={() => onOpenChange(false)}
      />
    </Sheet>
  )
}

function TransactionForm({
  items,
  defaultItem,
  onDone,
}: {
  items: BudgetItem[]
  defaultItem?: BudgetItem
  onDone: () => void
}) {
  const me = useMe()
  const create = useCreateTransaction()
  const today = todayIn(me.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)

  const [kind, setKind] = useState<Kind>(defaultItem?.kind ?? 'expense')
  const [amount, setAmount] = useState('')
  const [occurredOn, setOccurredOn] = useState(today)
  const [itemId, setItemId] = useState(defaultItem?.id ?? '')
  const [payee, setPayee] = useState('')
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
        allocations: itemId ? [{ budget_item_id: itemId, amount: value }] : [],
      },
      { onSuccess: onDone },
    )
  }

  const incomeItems = items.filter((i) => i.kind === 'income')
  const expenseItems = items.filter((i) => i.kind === 'expense')

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
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

      {(invalid || create.isError) && (
        <p className="text-sm text-red-700">{invalid ?? errorMessage(create.error)}</p>
      )}

      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? 'Saving…' : 'Log transaction'}
      </Button>
    </form>
  )
}
