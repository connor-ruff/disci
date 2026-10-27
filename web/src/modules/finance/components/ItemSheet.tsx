import { ArrowLeft, CircleCheck, Clock, List, Pencil, Plus } from 'lucide-react'
import { type FormEvent, type ReactNode, useState } from 'react'

import { errorMessage } from '@/shared/api/client'
import { cn } from '@/shared/lib/cn'
import { formatMoney, parseMoneyInput } from '@/shared/lib/money'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Field, inputClasses } from '@/shared/ui/field'
import { Segmented } from '@/shared/ui/segmented'
import { Sheet } from '@/shared/ui/sheet'

import {
  type BudgetItem,
  type BudgetTransaction,
  type ChecklistMode,
  type Kind,
  useBudgetTransactions,
  useCategories,
  useCreateItem,
  useDeleteItem,
  useUpdateItem,
} from '../api'
import { TransactionList } from './TransactionList'

type ItemSheetProps = {
  budgetId: string
  /** Checklist items are only allowed in monthly budgets. */
  isMonthly: boolean
  /** View this item, or create a new one of `kind` when undefined. */
  item?: BudgetItem
  kind: Kind
  open: boolean
  onOpenChange: (open: boolean) => void
  onLogTransaction: (item: BudgetItem) => void
  onOpenTransaction: (transaction: BudgetTransaction) => void
}

type Mode = 'view' | 'edit' | 'transactions'

/** An item's facts, with Edit, View transactions and Log transaction; or the form for a new item. */
export function ItemSheet({
  budgetId,
  isMonthly,
  item,
  kind,
  open,
  onOpenChange,
  onLogTransaction,
  onOpenTransaction,
}: ItemSheetProps) {
  const [mode, setMode] = useState<Mode>('view')
  const noun = kind === 'income' ? 'income' : 'expense'

  function onOpenChangeAndReset(next: boolean) {
    if (!next) setMode('view')
    onOpenChange(next)
  }

  const title = !item
    ? `Add ${noun}`
    : mode === 'edit'
      ? `Edit ${item.name}`
      : mode === 'transactions'
        ? `${item.name} transactions`
        : item.name

  return (
    <Sheet open={open} onOpenChange={onOpenChangeAndReset} title={title}>
      {!item || mode === 'edit' ? (
        // Keyed so the form resets whenever a different item (or "new") is opened.
        <ItemForm
          key={item?.id ?? `new-${kind}`}
          budgetId={budgetId}
          isMonthly={isMonthly}
          item={item}
          kind={kind}
          onDone={() => (item ? setMode('view') : onOpenChangeAndReset(false))}
          onCancel={item && (() => setMode('view'))}
        />
      ) : mode === 'transactions' ? (
        <ItemTransactions
          budgetId={budgetId}
          item={item}
          onBack={() => setMode('view')}
          onOpen={onOpenTransaction}
        />
      ) : (
        <ItemFacts
          budgetId={budgetId}
          isMonthly={isMonthly}
          item={item}
          onEdit={() => setMode('edit')}
          onViewTransactions={() => setMode('transactions')}
          onLogTransaction={() => onLogTransaction(item)}
          onDeleted={() => onOpenChangeAndReset(false)}
        />
      )}
    </Sheet>
  )
}

function ItemFacts({
  budgetId,
  isMonthly,
  item,
  onEdit,
  onViewTransactions,
  onLogTransaction,
  onDeleted,
}: {
  budgetId: string
  isMonthly: boolean
  item: BudgetItem
  onEdit: () => void
  onViewTransactions: () => void
  onLogTransaction: () => void
  onDeleted: () => void
}) {
  const remove = useDeleteItem(budgetId)
  const actual = Number(item.actual_amount)
  const planned = Number(item.planned_amount)
  const ratio = planned > 0 ? Math.max(0, actual) / planned : actual > 0 ? 1 : 0
  const over = item.kind === 'expense' && actual > planned

  function onDelete() {
    if (window.confirm(`Delete "${item.name}"? Its transactions stay but won't count toward this budget.`)) {
      remove.mutate(item.id, { onSuccess: onDeleted })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-muted">
          <span className={cn('text-2xl font-semibold text-foreground', over && 'text-amber-700')}>
            {formatMoney(actual)}
          </span>{' '}
          {item.kind === 'income' ? 'received' : 'spent'} of {formatMoney(planned)}
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border">
          <div
            className={cn('h-full rounded-full', over ? 'bg-amber-500' : 'bg-accent')}
            style={{ width: `${Math.min(ratio, 1) * 100}%` }}
          />
        </div>
        {Number(item.pending_amount) !== 0 && (
          <p className="mt-1.5 text-xs text-amber-700">{formatMoney(item.pending_amount)} awaiting approval</p>
        )}
      </div>

      <dl className="divide-y divide-border rounded-lg border border-border">
        <Fact label="Name">{item.name}</Fact>
        <Fact label="Planned amount">{formatMoney(planned)}</Fact>
        <Fact label="Category">{item.category_name ?? 'Uncategorized'}</Fact>
        {isMonthly && (
          <Fact label="Monthly checklist">
            {item.is_checklist_item && item.checklist_day ? (
              <span className="inline-flex items-center gap-1.5">
                {item.checklist_done ? (
                  <CircleCheck className="size-4 text-accent" />
                ) : (
                  <Clock className="size-4 text-muted" />
                )}
                Due the {ordinal(item.checklist_day)}
                {item.checklist_mode === 'any_payment' && <span className="text-muted">· any payment</span>}
                {item.checklist_done && <span className="text-muted">· done</span>}
              </span>
            ) : (
              <span className="text-muted">Not on the checklist</span>
            )}
          </Fact>
        )}
      </dl>

      <div className="grid grid-cols-3 gap-2">
        <ActionButton icon={<Pencil className="size-5" />} label="Edit" onClick={onEdit} />
        <ActionButton icon={<List className="size-5" />} label="View transactions" onClick={onViewTransactions} />
        <ActionButton icon={<Plus className="size-5" />} label="Log transaction" onClick={onLogTransaction} primary />
      </div>
      <Button variant="ghost" onClick={onDelete} disabled={remove.isPending} className="text-red-700">
        Delete item
      </Button>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium">{children}</dd>
    </div>
  )
}

/** A square-ish button with the icon above its label, so three fit side by side on phones. */
function ActionButton({
  icon,
  label,
  onClick,
  primary,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <Button
      variant={primary ? 'primary' : 'outline'}
      onClick={onClick}
      className="h-auto flex-col gap-1 px-2 py-3 text-sm leading-tight"
    >
      {icon}
      {label}
    </Button>
  )
}

function ItemTransactions({
  budgetId,
  item,
  onBack,
  onOpen,
}: {
  budgetId: string
  item: BudgetItem
  onBack: () => void
  onOpen: (transaction: BudgetTransaction) => void
}) {
  const transactions = useBudgetTransactions(budgetId)
  const rows = transactions.data?.filter((t) => t.budget_item_id === item.id)

  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" onClick={onBack} className="-ml-2 self-start px-2 text-primary">
        <ArrowLeft className="size-4" />
        Back to {item.name}
      </Button>
      {transactions.isPending && <p className="py-4 text-muted">Loading…</p>}
      {rows?.length === 0 && <p className="py-4 text-muted">Nothing logged to {item.name} yet.</p>}
      {rows && rows.length > 0 && (
        <div className="-mx-4 border-y border-border">
          <TransactionList transactions={rows} onOpen={onOpen} showItem={false} />
        </div>
      )}
    </div>
  )
}

function ItemForm({
  budgetId,
  isMonthly,
  item,
  kind,
  onDone,
  onCancel,
}: {
  budgetId: string
  isMonthly: boolean
  item?: BudgetItem
  kind: Kind
  onDone: () => void
  onCancel?: () => void
}) {
  const categories = useCategories()
  const create = useCreateItem(budgetId)
  const update = useUpdateItem(budgetId)

  const [name, setName] = useState(item?.name ?? '')
  const [categoryId, setCategoryId] = useState(item?.category_id ?? '')
  const [planned, setPlanned] = useState(item ? String(Number(item.planned_amount)) : '')
  const [isChecklist, setIsChecklist] = useState(item?.is_checklist_item ?? false)
  const [checklistDay, setChecklistDay] = useState(item?.checklist_day ?? 1)
  const [checklistMode, setChecklistMode] = useState<ChecklistMode>(item?.checklist_mode ?? 'full_amount')
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
      checklist_mode: checklistMode,
    }
    if (item) update.mutate({ id: item.id, ...body }, { onSuccess: onDone })
    else create.mutate({ kind, ...body }, { onSuccess: onDone })
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
            hint="Shows on the Checklist tab with the day it's due."
          />
          {isChecklist && (
            <Field label="Done when" hint={CHECKLIST_MODES[checklistMode].hint}>
              <Segmented
                label="Done when"
                value={checklistMode}
                onChange={setChecklistMode}
                options={(['full_amount', 'any_payment'] as const).map((m) => ({
                  value: m,
                  label: CHECKLIST_MODES[m].label,
                }))}
              />
            </Field>
          )}
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
        {onCancel && (
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}

/** How a checklist item counts as done, as the item form shows it. */
const CHECKLIST_MODES: Record<ChecklistMode, { label: string; hint: string }> = {
  full_amount: { label: 'Full amount', hint: 'Checked off once payments reach the planned amount.' },
  any_payment: { label: 'Any payment', hint: 'Checked off by the first payment, whatever it comes to. For bills that vary.' },
}

export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}`
}
