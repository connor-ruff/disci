import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { CircleCheck, Clock, Inbox, Plus, Trash2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { cn } from '@/shared/lib/cn'
import { formatDateRange, formatShortDate } from '@/shared/lib/dates'
import { formatMoney } from '@/shared/lib/money'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'
import { SortableList } from '@/shared/ui/sortable'

import {
  type BudgetDetail,
  type BudgetItem,
  type Kind,
  useBudget,
  useBudgetTransactions,
  useCategories,
  useDeleteBudget,
  useDeleteTransaction,
  useInbox,
  useReorderCategories,
  useReorderItems,
} from '../api'
import { ActiveBadge } from '../components/ActiveBadge'
import { ItemSheet, ordinal } from '../components/ItemSheet'
import { ReorderToggle } from '../components/ReorderToggle'
import { TransactionSheet } from '../components/TransactionSheet'

type ItemSheetState = { kind: Kind; item?: BudgetItem } | null

export function BudgetPage() {
  const { budgetId } = useParams({ from: '/finance/budgets/$budgetId' })
  const budget = useBudget(budgetId)

  const [reordering, setReordering] = useState(false)
  const [itemSheet, setItemSheet] = useState<ItemSheetState>(null)
  const [txnSheet, setTxnSheet] = useState<{ item?: BudgetItem } | null>(null)

  if (budget.isPending) return <LoadingState />
  if (budget.isError) return <ErrorState error={budget.error} />
  const data = budget.data

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title={data.name}
          description={
            <span className="flex items-center gap-2">
              {formatDateRange(data.period_start, data.period_end)}
              <ActiveBadge budget={data} />
            </span>
          }
        />
        <ReorderToggle reordering={reordering} onChange={setReordering} />
      </div>

      <div className="flex flex-col gap-4">
        <PendingBanner />
        {!reordering && <Summary budget={data} />}
        {(['income', 'expense'] as const).map((kind) => (
          <ItemSection
            key={kind}
            budget={data}
            kind={kind}
            reordering={reordering}
            onOpenItem={(item) => setItemSheet({ kind, item })}
            onAdd={() => setItemSheet({ kind })}
          />
        ))}
        {!reordering && <Transactions budgetId={budgetId} />}
        {!reordering && <DeleteBudget budgetId={budgetId} name={data.name} />}
      </div>

      {/* Primary action, within thumb reach on phones. */}
      {!reordering && (
        <Button
          onClick={() => setTxnSheet({})}
          className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 h-14 rounded-full px-5 shadow-lg"
        >
          <Plus className="size-5" />
          Log transaction
        </Button>
      )}

      <ItemSheet
        budgetId={budgetId}
        isMonthly={data.period_type === 'month'}
        kind={itemSheet?.kind ?? 'expense'}
        item={itemSheet?.item}
        open={itemSheet !== null}
        onOpenChange={(open) => !open && setItemSheet(null)}
        onLogTransaction={(item) => {
          setItemSheet(null)
          setTxnSheet({ item })
        }}
      />
      <TransactionSheet
        budget={data}
        items={data.items}
        defaultItem={txnSheet?.item}
        open={txnSheet !== null}
        onOpenChange={(open) => !open && setTxnSheet(null)}
      />
    </>
  )
}

/** A nudge when recurring transactions are waiting for approval. */
function PendingBanner() {
  const inbox = useInbox()
  const count = inbox.data?.pending.length ?? 0
  if (count === 0) return null
  return (
    <Link to="/finance/inbox" className="block rounded-2xl">
      <Card className="flex items-center gap-3 border-amber-200 bg-amber-50 transition hover:bg-amber-100">
        <Inbox className="size-5 shrink-0 text-amber-700" />
        <span className="flex-1 text-sm font-medium">
          {count} recurring {count === 1 ? 'transaction needs' : 'transactions need'} your approval
        </span>
        <span className="text-sm font-semibold text-amber-800">Review</span>
      </Card>
    </Link>
  )
}

function Summary({ budget }: { budget: BudgetDetail }) {
  const surplus = Number(budget.income.planned) - Number(budget.expense.planned)
  return (
    <Card className="grid grid-cols-3 gap-2 text-center">
      <Stat label="Income" value={budget.income.actual} of={budget.income.planned} />
      <Stat label="Spent" value={budget.expense.actual} of={budget.expense.planned} />
      <div>
        <p className="text-xs font-medium tracking-wide text-muted uppercase">Budget surplus / deficit</p>
        <p className={cn('mt-1 text-lg font-semibold', surplus < 0 && 'text-amber-700')}>
          {formatMoney(surplus)}
        </p>
        <p className="text-xs text-muted">planned income − expenses</p>
      </div>
    </Card>
  )
}

function Stat({ label, value, of }: { label: string; value: string; of: string }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-lg font-semibold">{formatMoney(value)}</p>
      <p className="text-xs text-muted">of {formatMoney(of)}</p>
    </div>
  )
}

type Group = { categoryId: string | null; name: string; items: BudgetItem[] }

/** One side's items grouped by category, in display order (Uncategorized last). */
function groupItems(items: BudgetItem[]): Group[] {
  const groups = new Map<string, Group>()
  for (const item of items) {
    const key = item.category_id ?? ''
    const group = groups.get(key) ?? { categoryId: item.category_id, name: item.category_name ?? 'Uncategorized', items: [] }
    group.items.push(item)
    groups.set(key, group)
  }
  // The API orders by category then item; keep Uncategorized at the end regardless.
  return [...groups.values()].sort((a, b) => Number(a.categoryId === null) - Number(b.categoryId === null))
}

/** One side of the budget (Income or Expenses), grouped by category. */
function ItemSection({
  budget,
  kind,
  reordering,
  onOpenItem,
  onAdd,
}: {
  budget: BudgetDetail
  kind: Kind
  reordering: boolean
  onOpenItem: (item: BudgetItem) => void
  onAdd: () => void
}) {
  const items = budget.items.filter((i) => i.kind === kind)
  const groups = groupItems(items)
  const categories = useCategories()
  const reorderCategories = useReorderCategories()
  const reorderItems = useReorderItems(budget.id)

  /** Category order is global: shown categories in their new order, then the rest. */
  function onReorderGroups(ordered: Group[]) {
    const shown = ordered.map((g) => g.categoryId).filter((id): id is string => id !== null)
    const rest = (categories.data ?? []).filter((c) => c.kind === kind && !shown.includes(c.id)).map((c) => c.id)
    reorderCategories.mutate({ kind, ids: [...shown, ...rest] })
  }

  /** Item order is per budget: send every item, with this group's in their new order. */
  function onReorderItems(group: Group, ordered: BudgetItem[]) {
    const ids = budget.items.flatMap((i) =>
      i.kind === kind && (i.category_id ?? null) === group.categoryId
        ? ordered.shift() ?? []
        : [i],
    )
    reorderItems.mutate(ids.map((i) => i.id))
  }

  const title = kind === 'income' ? 'Income' : 'Expenses'
  const categorized = groups.filter((g) => g.categoryId !== null)
  const uncategorized = groups.find((g) => g.categoryId === null)

  const renderGroup = (group: Group, handle?: ReactNode) => (
    <div className="pb-1">
      <div className="flex items-center gap-1 pt-2 pr-4 pl-1">
        {handle ?? <span className="w-3" />}
        <h3 className="py-1 text-xs font-semibold tracking-wide text-muted uppercase">{group.name}</h3>
      </div>
      {reordering ? (
        <SortableList
          label={`${group.name} items`}
          items={group.items}
          getId={(i) => i.id}
          onReorder={(ordered) => onReorderItems(group, [...ordered])}
          renderItem={(item, itemHandle) => (
            <div className="flex items-center gap-1 py-1 pr-4 pl-4">
              {itemHandle}
              <span className="flex-1">{item.name}</span>
              <span className="text-sm text-muted">{formatMoney(item.planned_amount)}</span>
            </div>
          )}
        />
      ) : (
        <ul>
          {group.items.map((item) => (
            <li key={item.id}>
              <ItemRow item={item} onClick={() => onOpenItem(item)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <Card className="p-0">
      <h2 className="px-4 pt-4 pb-1 text-lg font-semibold">{title}</h2>
      {reordering ? (
        <>
          {categorized.length > 1 && (
            <p className="px-4 text-sm text-muted">Drag categories by their grip, or items within them.</p>
          )}
          <SortableList
            label={`${title} categories`}
            items={categorized}
            getId={(g) => g.categoryId ?? ''}
            onReorder={onReorderGroups}
            renderItem={(group, handle) => renderGroup(group, handle)}
          />
          {uncategorized && renderGroup(uncategorized)}
        </>
      ) : (
        groups.map((group) => <div key={group.categoryId ?? ''}>{renderGroup(group)}</div>)
      )}
      {items.length === 0 && (
        <p className="px-4 pt-1 pb-2 text-muted">
          {kind === 'income' ? 'Plan what you expect to earn.' : 'Plan what you expect to spend.'}
        </p>
      )}
      {!reordering && (
        <div className="border-t border-border p-2">
          <Button variant="ghost" onClick={onAdd} className="w-full text-primary">
            <Plus className="size-5" />
            Add {kind === 'income' ? 'income' : 'expense'}
          </Button>
        </div>
      )}
    </Card>
  )
}

function ItemRow({ item, onClick }: { item: BudgetItem; onClick: () => void }) {
  const actual = Number(item.actual_amount)
  const planned = Number(item.planned_amount)
  const pending = Number(item.pending_amount)
  const ratio = planned > 0 ? Math.max(0, actual) / planned : actual > 0 ? 1 : 0
  const over = item.kind === 'expense' && actual > planned

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-1.5 px-4 py-2.5 text-left transition hover:bg-highlight"
    >
      <div className="flex w-full items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-medium">{item.name}</span>
        <span className="shrink-0 text-sm text-muted">
          <span className={cn('font-semibold text-foreground', over && 'text-amber-700')}>
            {formatMoney(actual)}
          </span>{' '}
          of {formatMoney(planned)}
        </span>
      </div>
      {/* Explicit w-full: inside a <button>, Safari doesn't stretch an empty child. */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className={cn('h-full rounded-full', over ? 'bg-amber-500' : 'bg-accent')}
          style={{ width: `${Math.min(ratio, 1) * 100}%` }}
        />
      </div>
      {(item.is_checklist_item || pending !== 0) && (
        <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
          {item.is_checklist_item && item.checklist_day && (
            <span className="inline-flex items-center gap-1">
              {item.checklist_done ? (
                <CircleCheck className="size-3 text-accent" />
              ) : (
                <Clock className="size-3" />
              )}
              {item.checklist_done ? 'Checklist done' : `Due ${ordinal(item.checklist_day)}`}
            </span>
          )}
          {pending !== 0 && <span className="text-amber-700">{formatMoney(pending)} awaiting approval</span>}
        </span>
      )}
    </button>
  )
}

function Transactions({ budgetId }: { budgetId: string }) {
  const transactions = useBudgetTransactions(budgetId)
  const remove = useDeleteTransaction()

  return (
    <Card className="p-0">
      <h2 className="px-4 pt-4 pb-2 text-lg font-semibold">Transactions</h2>
      {transactions.isPending && <p className="px-4 pb-4 text-muted">Loading…</p>}
      {transactions.data?.length === 0 && (
        <p className="px-4 pb-4 text-muted">Nothing logged in this budget yet.</p>
      )}
      <ul className="divide-y divide-border">
        {transactions.data?.map((t) => (
          <li key={`${t.id}-${t.budget_item_id}`} className="flex items-center gap-3 py-2 pr-2 pl-4">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2">
                <span className="truncate font-medium">{t.payee ?? t.budget_item_name}</span>
                {t.status === 'pending' && (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                    Pending
                  </span>
                )}
              </p>
              <p className="truncate text-sm text-muted">
                {t.budget_item_name} · {formatShortDate(t.occurred_on)}
                {t.notes && ` · ${t.notes}`}
              </p>
            </div>
            <span
              className={cn(
                'shrink-0 font-semibold',
                t.kind === 'income' && 'text-primary',
                t.status === 'pending' && 'text-muted',
              )}
            >
              {t.kind === 'income' ? '+' : '−'}
              {formatMoney(t.allocated_amount)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete transaction"
              disabled={remove.isPending}
              onClick={() => window.confirm('Delete this transaction?') && remove.mutate(t.id)}
            >
              <Trash2 className="size-4 text-muted" />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function DeleteBudget({ budgetId, name }: { budgetId: string; name: string }) {
  const remove = useDeleteBudget()
  const navigate = useNavigate()
  return (
    <Button
      variant="ghost"
      className="mb-16 self-center text-red-700"
      disabled={remove.isPending}
      onClick={() => {
        if (window.confirm(`Delete the budget "${name}"? Its transactions are kept.`)) {
          remove.mutate(budgetId, { onSuccess: () => navigate({ to: '/finance/budgets' }) })
        }
      }}
    >
      Delete budget
    </Button>
  )
}
