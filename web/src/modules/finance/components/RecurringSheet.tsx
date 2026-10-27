import { type FormEvent, useState } from 'react'

import { errorMessage } from '@/shared/api/client'
import { useMe } from '@/shared/api/hooks'
import { todayIn } from '@/shared/lib/dates'
import { parseMoneyInput } from '@/shared/lib/money'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Field, inputClasses } from '@/shared/ui/field'
import { Segmented } from '@/shared/ui/segmented'
import { Sheet } from '@/shared/ui/sheet'

import {
  type Kind,
  type Recurring,
  type RecurringIn,
  useCategories,
  useDeleteRecurring,
  useItemNameSuggestions,
  useSaveRecurring,
} from '../api'
import { ordinal } from './ItemSheet'

type Frequency = RecurringIn['frequency']

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

type RecurringSheetProps = {
  /** Edit this rule, or create a new one when undefined. */
  rule?: Recurring
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RecurringSheet({ rule, open, onOpenChange }: RecurringSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={rule ? rule.name : 'New recurring transaction'}>
      <RecurringForm key={`${open}-${rule?.id ?? 'new'}`} rule={rule} onDone={() => onOpenChange(false)} />
    </Sheet>
  )
}

function RecurringForm({ rule, onDone }: { rule?: Recurring; onDone: () => void }) {
  const me = useMe()
  const categories = useCategories()
  const save = useSaveRecurring()
  const remove = useDeleteRecurring()
  const today = todayIn(me.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)

  const [kind, setKind] = useState<Kind>(rule?.kind ?? 'expense')
  const [name, setName] = useState(rule?.name ?? '')
  // A new rule's item follows its name until the item is edited on its own.
  const [itemName, setItemName] = useState(rule?.item_name ?? '')
  const [itemTouched, setItemTouched] = useState(!!rule)
  const [amount, setAmount] = useState(rule ? String(Number(rule.amount)) : '')
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? '')
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? 'monthly')
  const [dayOfMonth, setDayOfMonth] = useState(rule?.day_of_month ?? 1)
  const [dayOfWeek, setDayOfWeek] = useState(rule?.day_of_week ?? 1)
  const [startsOn, setStartsOn] = useState(rule?.starts_on ?? today)
  const [endsOn, setEndsOn] = useState(rule?.ends_on ?? '')
  const [autoApply, setAutoApply] = useState(rule?.auto_apply ?? true)
  const [payee, setPayee] = useState(rule?.payee ?? '')
  const [notes, setNotes] = useState(rule?.notes ?? '')
  const [paused, setPaused] = useState(rule?.paused ?? false)
  const [invalid, setInvalid] = useState<string | null>(null)

  const suggestions = useItemNameSuggestions(kind, today)
  const repeatsFromStart = frequency === 'quarterly' || frequency === 'yearly'

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const value = parseMoneyInput(amount)
    if (value === null || Number(value) === 0) return setInvalid('Enter an amount like 15.49')
    if (frequency === 'quarterly' && Number(startsOn.slice(8, 10)) > 28) {
      return setInvalid('Quarterly transactions must start on day 1–28 so every quarter has that day.')
    }
    setInvalid(null)
    save.mutate(
      {
        id: rule?.id,
        kind,
        name: name.trim(),
        item_name: itemName.trim(),
        amount: value,
        category_id: categoryId || null,
        frequency,
        day_of_month: frequency === 'monthly' ? dayOfMonth : null,
        day_of_week: frequency === 'weekly' ? dayOfWeek : null,
        starts_on: startsOn,
        ends_on: endsOn || null,
        auto_apply: autoApply,
        payee: payee.trim() || null,
        notes: notes.trim() || null,
        paused,
      },
      { onSuccess: onDone },
    )
  }

  function onDelete() {
    if (!rule) return
    if (window.confirm(`Delete "${rule.name}"? Transactions it already created are kept.`)) {
      remove.mutate(rule.id, { onSuccess: onDone })
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Segmented
        label="Type"
        value={kind}
        onChange={(value) => {
          setKind(value)
          setCategoryId('') // categories are per type
        }}
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
        ]}
      />

      <Field label="Name" htmlFor="rec-name">
        <input
          id="rec-name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (!itemTouched) setItemName(e.target.value)
          }}
          maxLength={100}
          placeholder={kind === 'income' ? 'e.g. Paycheck' : 'e.g. Netflix'}
          className={inputClasses}
        />
      </Field>

      <Field
        label="Budget item"
        htmlFor="rec-item"
        hint="The item it counts toward in each budget: same name (any capitalization) and the category below."
      >
        <input
          id="rec-item"
          list="rec-name-suggestions"
          autoComplete="off"
          required
          value={itemName}
          onChange={(e) => {
            setItemName(e.target.value)
            setItemTouched(true)
          }}
          maxLength={100}
          placeholder={kind === 'income' ? 'e.g. Paycheck' : 'e.g. Subscriptions'}
          className={inputClasses}
        />
        {/* Suggests existing item names so the rule matches them exactly. */}
        <datalist id="rec-name-suggestions">
          {suggestions.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" htmlFor="rec-amount">
          <input
            id="rec-amount"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={inputClasses}
          />
        </Field>
        <Field label="Category" htmlFor="rec-category">
          <select
            id="rec-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={inputClasses}
          >
            <option value="">Uncategorized</option>
            {(categories.data ?? [])
              .filter((c) => c.kind === kind)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
      </div>

      <Field label="Repeats">
        <Segmented
          label="Frequency"
          value={frequency}
          onChange={setFrequency}
          options={[
            { value: 'monthly', label: 'Monthly' },
            { value: 'weekly', label: 'Weekly' },
            { value: 'quarterly', label: 'Quarterly' },
            { value: 'yearly', label: 'Yearly' },
          ]}
        />
      </Field>

      {frequency === 'monthly' && (
        <Field label="On day" htmlFor="rec-dom">
          <select
            id="rec-dom"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(Number(e.target.value))}
            className={inputClasses}
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {ordinal(d)} of each month
              </option>
            ))}
          </select>
        </Field>
      )}
      {frequency === 'weekly' && (
        <Field label="Every" htmlFor="rec-dow">
          <select
            id="rec-dow"
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
            className={inputClasses}
          >
            {WEEKDAYS.map((day, i) => (
              <option key={day} value={i + 1}>
                {day}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field
          label={repeatsFromStart ? 'First date' : 'Starting'}
          htmlFor="rec-start"
          hint={repeatsFromStart ? quarterlyHint(frequency, startsOn) : undefined}
        >
          <input
            id="rec-start"
            type="date"
            required
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            className={inputClasses}
          />
        </Field>
        <Field label="Ends (optional)" htmlFor="rec-end">
          <input
            id="rec-end"
            type="date"
            value={endsOn}
            min={startsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            className={inputClasses}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-3 rounded-lg bg-background p-3">
        <Checkbox
          id="rec-auto"
          checked={autoApply}
          onChange={setAutoApply}
          label="Auto-apply"
          hint="Counts it toward the budget item in every budget whose dates include it, with no approval. A budget without that item asks you in the Inbox. Off: every one waits in the Inbox for you to approve (and fix the amount) and place."
        />
        {rule && (
          <Checkbox id="rec-paused" checked={paused} onChange={setPaused} label="Paused" hint="Creates nothing while paused." />
        )}
      </div>

      <Field label="Payee (optional)" htmlFor="rec-payee">
        <input
          id="rec-payee"
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          maxLength={200}
          className={inputClasses}
        />
      </Field>
      <Field label="Notes (optional)" htmlFor="rec-notes">
        <textarea
          id="rec-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
          rows={2}
          className={inputClasses + ' h-auto py-2'}
        />
      </Field>

      {(invalid || save.isError) && (
        <p className="text-sm text-red-700">{invalid ?? errorMessage(save.error)}</p>
      )}

      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? 'Saving…' : rule ? 'Save' : 'Create'}
      </Button>
      {rule && (
        <Button variant="ghost" onClick={onDelete} disabled={remove.isPending} className="text-red-700">
          Delete recurring transaction
        </Button>
      )}
    </form>
  )
}

/** "Also May 10, Aug 10 and Nov 10" for quarterly; "Every year on Feb 10" for yearly. */
function quarterlyHint(frequency: Frequency, startsOn: string): string | undefined {
  if (!startsOn) return undefined
  const [y, m, d] = startsOn.split('-').map(Number)
  const fmt = (month: number) =>
    new Date(y, month - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (frequency === 'yearly') return `Every year on ${fmt(m)}`
  const later = [3, 6, 9].map((offset) => fmt(((m - 1 + offset) % 12) + 1))
  return `Then ${later[0]}, ${later[1]} and ${later[2]} each year`
}

/** "Monthly on the 12th", "Every Monday", "Quarterly from Feb 10", "Yearly on Feb 10". */
export function describeSchedule(rule: Recurring): string {
  const start = new Date(`${rule.starts_on}T00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  switch (rule.frequency) {
    case 'monthly':
      return `Monthly on the ${ordinal(rule.day_of_month ?? 1)}`
    case 'weekly':
      return `Every ${WEEKDAYS[(rule.day_of_week ?? 1) - 1]}`
    case 'quarterly':
      return `Quarterly from ${start}`
    case 'yearly':
      return `Yearly on ${start}`
  }
}
