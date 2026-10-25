import { type FormEvent, useState } from 'react'

import { errorMessage } from '@/shared/api/client'
import { parseMoneyInput } from '@/shared/lib/money'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Field, inputClasses } from '@/shared/ui/field'
import { Sheet } from '@/shared/ui/sheet'

import {
  type BudgetItem,
  type Kind,
  useCategories,
  useCreateItem,
  useDeleteItem,
  useUpdateItem,
} from '../api'

type ItemSheetProps = {
  budgetId: string
  /** Checklist items are only allowed in monthly budgets. */
  isMonthly: boolean
  /** Edit this item, or create a new one of `kind` when undefined. */
  item?: BudgetItem
  kind: Kind
  open: boolean
  onOpenChange: (open: boolean) => void
  onLogTransaction?: (item: BudgetItem) => void
}

export function ItemSheet({
  budgetId,
  isMonthly,
  item,
  kind,
  open,
  onOpenChange,
  onLogTransaction,
}: ItemSheetProps) {
  const noun = kind === 'income' ? 'income' : 'expense'
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={item ? item.name : `Add ${noun}`}>
      {/* Keyed so the form resets whenever a different item (or "new") is opened. */}
      <ItemForm
        key={item?.id ?? `new-${kind}`}
        budgetId={budgetId}
        isMonthly={isMonthly}
        item={item}
        kind={kind}
        onDone={() => onOpenChange(false)}
        onLogTransaction={onLogTransaction}
      />
    </Sheet>
  )
}

function ItemForm({
  budgetId,
  isMonthly,
  item,
  kind,
  onDone,
  onLogTransaction,
}: {
  budgetId: string
  isMonthly: boolean
  item?: BudgetItem
  kind: Kind
  onDone: () => void
  onLogTransaction?: (item: BudgetItem) => void
}) {
  const categories = useCategories()
  const create = useCreateItem(budgetId)
  const update = useUpdateItem(budgetId)
  const remove = useDeleteItem(budgetId)

  const [name, setName] = useState(item?.name ?? '')
  const [categoryId, setCategoryId] = useState(item?.category_id ?? '')
  const [planned, setPlanned] = useState(item ? String(Number(item.planned_amount)) : '')
  const [isChecklist, setIsChecklist] = useState(item?.is_checklist_item ?? false)
  const [checklistDay, setChecklistDay] = useState(item?.checklist_day ?? 1)
  const [invalid, setInvalid] = useState<string | null>(null)

  const options = (categories.data ?? []).filter((c) => c.kind === kind)
  const mutation = item ? update : create

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const amount = parseMoneyInput(planned || '0')
    if (amount === null) return setInvalid('Enter an amount like 120 or 120.50')
    setInvalid(null)
    const body = {
      name: name.trim(),
      category_id: categoryId || null,
      planned_amount: amount,
      is_checklist_item: isChecklist,
      checklist_day: isChecklist ? checklistDay : null,
    }
    if (item) update.mutate({ id: item.id, ...body }, { onSuccess: onDone })
    else create.mutate({ kind, ...body }, { onSuccess: onDone })
  }

  function onDelete() {
    if (!item) return
    if (window.confirm(`Delete "${item.name}"? Its transactions stay but won't count toward this budget.`)) {
      remove.mutate(item.id, { onSuccess: onDone })
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Name" htmlFor="item-name">
        <input
          id="item-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder={kind === 'income' ? 'e.g. Paycheck' : 'e.g. Groceries'}
          className={inputClasses}
        />
      </Field>

      <Field label="Planned amount" htmlFor="item-planned">
        <input
          id="item-planned"
          inputMode="decimal"
          value={planned}
          onChange={(e) => setPlanned(e.target.value)}
          placeholder="0.00"
          className={inputClasses}
        />
      </Field>

      <Field label="Category" htmlFor="item-category">
        <select
          id="item-category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={inputClasses}
        >
          <option value="">Uncategorized</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      {isMonthly && (
        <div className="flex flex-col gap-3 rounded-lg bg-background p-3">
          <Checkbox
            id="item-checklist"
            checked={isChecklist}
            onChange={setIsChecklist}
            label="On the monthly checklist"
            hint="Shows on the Checklist tab, and is done once what's logged here reaches the planned amount."
          />
          {isChecklist && (
            <Field label="Due on day" htmlFor="item-checklist-day">
              <select
                id="item-checklist-day"
                value={checklistDay}
                onChange={(e) => setChecklistDay(Number(e.target.value))}
                className={inputClasses}
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {ordinal(d)} of the month
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      )}

      {(invalid || mutation.isError) && (
        <p className="text-sm text-red-700">{invalid ?? errorMessage(mutation.error)}</p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" disabled={mutation.isPending} className="flex-1">
          {mutation.isPending ? 'Saving…' : item ? 'Save' : 'Add'}
        </Button>
        {item && onLogTransaction && (
          <Button variant="outline" onClick={() => onLogTransaction(item)} className="flex-1">
            Log transaction
          </Button>
        )}
      </div>
      {item && (
        <Button variant="ghost" onClick={onDelete} disabled={remove.isPending} className="text-red-700">
          Delete item
        </Button>
      )}
    </form>
  )
}

export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}`
}
