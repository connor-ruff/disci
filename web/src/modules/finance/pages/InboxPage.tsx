import { Check, Inbox as InboxIcon, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'

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
  type InboxEntry,
  type InboxTransaction,
  useAssign,
  useBudget,
  useBudgets,
  useCategories,
  useCreateItem,
  useDismissEntry,
  useInbox,
  useMarkInboxSeen,
  useResolveEntry,
} from '../api'
import { TransactionDetailSheet } from '../components/TransactionDetailSheet'

export function InboxPage() {
  const inbox = useInbox()
  const markSeen = useMarkInboxSeen()
  const [reviewing, setReviewing] = useState<InboxEntry | null>(null)
  const [assigning, setAssigning] = useState<InboxTransaction | null>(null)
  const [viewing, setViewing] = useState<InboxEntry | null>(null)

  const data = inbox.data
  const empty = data && data.needs_you.length === 0 && data.unassigned.length === 0 && data.ledger.length === 0

  return (
    <>
      <PageHeader title="Inbox" description="Recurring transactions to approve or place, and what applied on its own." />
      {inbox.isPending && <LoadingState />}
      {inbox.isError && <ErrorState error={inbox.error} />}
      {empty && (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <InboxIcon className="size-10 text-accent" />
          <h2 className="text-lg font-semibold">All caught up</h2>
          <p className="max-w-sm text-muted">Nothing waiting on you.</p>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {!!data?.needs_you.length && (
          <Card className="p-0">
            <h2 className="px-4 pt-4 pb-1 text-lg font-semibold">Needs you</h2>
            <p className="px-4 pb-2 text-sm text-muted">Recurring transactions that couldn't place themselves.</p>
            <ul className="divide-y divide-border">
              {data.needs_you.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setReviewing(e)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-highlight"
                  >
                    <div className="min-w-0 flex-1">
                      <Summary transaction={e.transaction} />
                      <p className="truncate text-sm text-amber-700">{entryProblem(e)}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-primary">Review</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {!!data?.unassigned.length && (
          <Card className="p-0">
            <h2 className="px-4 pt-4 pb-1 text-lg font-semibold">Not in a budget</h2>
            <p className="px-4 pb-2 text-sm text-muted">Logged, but not counted toward any budget item yet.</p>
            <ul className="divide-y divide-border">
              {data.unassigned.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2 pr-2 pl-4">
                  <div className="min-w-0 flex-1">
                    <Summary transaction={t} />
                  </div>
                  <Button variant="outline" onClick={() => setAssigning(t)}>
                    Assign
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {!!data?.ledger.length && (
          <Card className="p-0">
            <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-2">
              <h2 className="text-lg font-semibold">Applied automatically</h2>
              {data.unseen > 0 && (
                <button
                  type="button"
                  disabled={markSeen.isPending}
                  onClick={() => markSeen.mutate()}
                  className="shrink-0 text-sm font-medium text-primary"
                >
                  Mark all read
                </button>
              )}
            </div>
            <ul className="divide-y divide-border">
              {data.ledger.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setViewing(e)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-highlight"
                  >
                    <span
                      aria-label={e.seen ? undefined : 'New'}
                      className={cn('size-2 shrink-0 rounded-full', e.seen ? 'bg-transparent' : 'bg-accent')}
                    />
                    <div className="min-w-0 flex-1">
                      <Summary transaction={e.transaction} />
                      <p className="truncate text-sm text-muted">
                        → {e.budget_item_name} · {e.budget_name}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {reviewing && <EntrySheet entry={reviewing} onClose={() => setReviewing(null)} />}
      {assigning && <AssignSheet transaction={assigning} onClose={() => setAssigning(null)} />}
      {viewing && <LedgerSheet entry={viewing} onClose={() => setViewing(null)} />}
    </>
  )
}

/** Why an entry needs the user. */
function entryProblem(e: InboxEntry): string {
  if (e.kind === 'pick_item') return `No "${e.item_name}" in ${e.budget_name}`
  return 'Approve and place'
}

function Summary({ transaction: t }: { transaction: InboxTransaction }) {
  return (
    <>
      <p className="truncate font-medium">{t.recurring_name ?? t.payee ?? 'Transaction'}</p>
      <p className="truncate text-sm text-muted">
        <span className={cn(t.kind === 'income' && 'text-primary')}>
          {t.kind === 'income' ? '+' : '−'}
          {formatMoney(t.amount)}
        </span>{' '}
        · {formatShortDate(t.occurred_on)}
        {t.notes && ` · ${t.notes}`}
      </p>
    </>
  )
}

/** "Meant for Electric & Gas · Utilities": the rule's intended item. */
function Intended({ entry }: { entry: InboxEntry }) {
  if (!entry.item_name) return null
  return (
    <p className="text-sm text-muted">
      Meant for <span className="font-medium text-foreground">{entry.item_name}</span> ·{' '}
      {entry.category_name ?? 'Uncategorized'}
    </p>
  )
}

function EntrySheet({ entry, onClose }: { entry: InboxEntry; onClose: () => void }) {
  const title = entry.kind === 'pick_item' ? `Pick an item in ${entry.budget_name}` : 'Approve and place'
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()} title={title}>
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-background p-3">
          <Summary transaction={entry.transaction} />
          <Intended entry={entry} />
        </div>
        {entry.kind === 'pick_item' ? (
          <PickForm entry={entry} onDone={onClose} />
        ) : (
          <PlaceForm entry={entry} onDone={onClose} />
        )}
      </div>
    </Sheet>
  )
}

/** pick_item: one item in the entry's budget, or skip that budget. */
function PickForm({ entry, onDone }: { entry: InboxEntry; onDone: () => void }) {
  const resolve = useResolveEntry()
  const dismiss = useDismissEntry()
  const [itemId, setItemId] = useState<string>()
  const busy = resolve.isPending || dismiss.isPending

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        It counts wherever else it matched. Pick where it goes in {entry.budget_name}, or skip this budget.
      </p>
      <ItemChooser budgetId={entry.budget_id!} entry={entry} value={itemId} onChange={setItemId} />
      {(resolve.isError || dismiss.isError) && (
        <p className="text-sm text-red-700">{errorMessage(resolve.error ?? dismiss.error)}</p>
      )}
      <Button
        disabled={!itemId || busy}
        onClick={() => itemId && resolve.mutate({ id: entry.id, itemIds: [itemId] }, { onSuccess: onDone })}
      >
        <Check className="size-5" />
        Count it here
      </Button>
      <Button variant="ghost" disabled={busy} onClick={() => dismiss.mutate(entry.id, { onSuccess: onDone })}>
        Skip this budget
      </Button>
    </div>
  )
}

/** place: the real amount, and an item (or none) in each budget covering its date. */
function PlaceForm({ entry, onDone }: { entry: InboxEntry; onDone: () => void }) {
  const t = entry.transaction
  const budgets = useBudgets()
  const resolve = useResolveEntry()
  const dismiss = useDismissEntry()
  const [amount, setAmount] = useState(String(Number(t.amount)))
  const [picks, setPicks] = useState<Record<string, string>>({})

  const covering = (budgets.data ?? []).filter((b) => b.period_start <= t.occurred_on && t.occurred_on <= b.period_end)
  const parsed = parseMoneyInput(amount)
  const busy = resolve.isPending || dismiss.isPending

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (parsed === null || Number(parsed) === 0) return
    const itemIds = covering.map((b) => picks[b.id]).filter((id): id is string => !!id)
    resolve.mutate({ id: entry.id, itemIds, amount: parsed }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Amount" htmlFor="place-amount" hint="Change it if the real amount differs.">
        <input
          id="place-amount"
          inputMode="decimal"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputClasses + ' text-lg font-semibold'}
        />
      </Field>

      {budgets.isPending && <p className="text-muted">Loading budgets…</p>}
      {budgets.data && covering.length === 0 && (
        <p className="rounded-lg bg-background p-3 text-sm text-muted">
          No budget covers {formatShortDate(t.occurred_on)} yet. Approve it now and it waits under Not in a budget,
          or create the budget first and come back.
        </p>
      )}
      {covering.map((b) => (
        <ItemChooser
          key={b.id}
          label={b.name}
          budgetId={b.id}
          entry={entry}
          allowNone
          value={picks[b.id]}
          onChange={(id) => setPicks((p) => ({ ...p, [b.id]: id }))}
        />
      ))}

      {(resolve.isError || dismiss.isError) && (
        <p className="text-sm text-red-700">{errorMessage(resolve.error ?? dismiss.error)}</p>
      )}
      <Button type="submit" disabled={busy || parsed === null || Number(parsed) === 0}>
        <Check className="size-5" />
        Approve
      </Button>
      <Button
        variant="ghost"
        className="text-red-700"
        disabled={busy}
        onClick={() =>
          window.confirm("Reject this? It won't be logged.") && dismiss.mutate(entry.id, { onSuccess: onDone })
        }
      >
        <X className="size-5" />
        Reject
      </Button>
    </form>
  )
}

const NEW_ITEM = '__new__'
const normalize = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * An item in one budget for an entry, with "+ New item…" to add one first (pre-filled from
 * the rule). Starts on where it already counts in that budget, else the rule's matching item.
 */
function ItemChooser({
  budgetId,
  entry,
  value,
  onChange,
  label = 'Budget item',
  allowNone = false,
}: {
  budgetId: string
  entry: InboxEntry
  value: string | undefined
  onChange: (itemId: string) => void
  label?: string
  allowNone?: boolean
}) {
  const budget = useBudget(budgetId)
  const [adding, setAdding] = useState(false)
  const items = budget.data?.items ?? []

  // Report the starting pick once the budget loads, so the parent submits what's shown.
  const started = useRef(false)
  useEffect(() => {
    if (started.current || !budget.data) return
    started.current = true
    const counted = entry.allocations?.find((a) => a.budget_id === budgetId)?.budget_item_id
    const matching = items.find(
      (i) =>
        i.kind === entry.transaction.kind &&
        entry.item_name !== null &&
        normalize(i.name) === normalize(entry.item_name) &&
        (i.category_id ?? null) === (entry.category_id ?? null),
    )?.id
    onChange(counted ?? matching ?? '')
  })

  const selectId = `chooser-${budgetId}`
  return (
    <div className="flex flex-col gap-2">
      <Field label={label} htmlFor={selectId}>
        <select
          id={selectId}
          value={adding ? NEW_ITEM : (value ?? '')}
          onChange={(e) => {
            if (e.target.value === NEW_ITEM) return setAdding(true)
            setAdding(false)
            onChange(e.target.value)
          }}
          className={inputClasses}
        >
          <option value="">{allowNone ? "Don't count it here" : 'Pick an item'}</option>
          {(['expense', 'income'] as const).map((kind) => (
            <optgroup key={kind} label={kind === 'income' ? 'Income' : 'Expenses'}>
              {items
                .filter((i) => i.kind === kind)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                    {i.category_name ? ` · ${i.category_name}` : ''}
                  </option>
                ))}
            </optgroup>
          ))}
          <option value={NEW_ITEM}>+ New item…</option>
        </select>
      </Field>
      {adding && (
        <NewItemForm
          budgetId={budgetId}
          entry={entry}
          onCreated={(id) => {
            setAdding(false)
            onChange(id)
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  )
}

/** Adds an item to the budget, pre-filled with the rule's item name, category and amount. */
function NewItemForm({
  budgetId,
  entry,
  onCreated,
  onCancel,
}: {
  budgetId: string
  entry: InboxEntry
  onCreated: (itemId: string) => void
  onCancel: () => void
}) {
  const kind = entry.transaction.kind
  const categories = useCategories()
  const before = useBudget(budgetId).data?.items.map((i) => i.id) ?? []
  const create = useCreateItem(budgetId)
  const [name, setName] = useState(entry.item_name ?? '')
  const [categoryId, setCategoryId] = useState(entry.category_id ?? '')
  const [planned, setPlanned] = useState(String(Number(entry.transaction.amount)))

  function onAdd() {
    const amount = parseMoneyInput(planned || '0')
    if (!name.trim() || amount === null) return
    create.mutate(
      {
        kind,
        name: name.trim(),
        category_id: categoryId || null,
        planned_amount: amount,
        is_checklist_item: false,
        checklist_mode: 'full_amount',
      },
      {
        onSuccess: (detail) => {
          const added = detail.items.find((i) => !before.includes(i.id))
          if (added) onCreated(added.id)
        },
      },
    )
  }

  // Not a <form>: it can sit inside the place form.
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-background p-3">
      <Field label="New item name" htmlFor={`new-item-${budgetId}`}>
        <input
          id={`new-item-${budgetId}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          className={inputClasses}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Planned" htmlFor={`new-item-planned-${budgetId}`}>
          <input
            id={`new-item-planned-${budgetId}`}
            inputMode="decimal"
            value={planned}
            onChange={(e) => setPlanned(e.target.value)}
            className={inputClasses}
          />
        </Field>
        <Field label="Category" htmlFor={`new-item-category-${budgetId}`}>
          <select
            id={`new-item-category-${budgetId}`}
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
      {create.isError && <p className="text-sm text-red-700">{errorMessage(create.error)}</p>}
      <div className="flex gap-2">
        <Button type="button" onClick={onAdd} disabled={create.isPending || !name.trim()} className="flex-1">
          {create.isPending ? 'Adding…' : 'Add item'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  )
}

/** A ledger entry opens its transaction (in the budget it landed in), to view or fix it. */
function LedgerSheet({ entry, onClose }: { entry: InboxEntry; onClose: () => void }) {
  const budget = useBudget(entry.budget_id!)
  if (!budget.data) return null
  return (
    <TransactionDetailSheet
      budget={budget.data}
      items={budget.data.items}
      transactionId={entry.transaction.id}
      open
      onOpenChange={(open) => !open && onClose()}
    />
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
        <div>
          <Summary transaction={t} />
        </div>
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
