import { useNavigate, useParams } from '@tanstack/react-router'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/shared/lib/cn'
import { formatDateRange, formatShortDate } from '@/shared/lib/dates'
import { formatMoney } from '@/shared/lib/money'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'

import {
  type BudgetDetail,
  type BudgetItem,
  type Kind,
  useBudget,
  useBudgetTransactions,
  useDeleteBudget,
  useDeleteTransaction,
} from '../api'
import { ItemSheet } from '../components/ItemSheet'
import { TransactionSheet } from '../components/TransactionSheet'

type ItemSheetState = { kind: Kind; item?: BudgetItem } | null

export function BudgetPage() {
  const { budgetId } = useParams({ from: '/finance/budgets/$budgetId' })
  const budget = useBudget(budgetId)

  const [itemSheet, setItemSheet] = useState<ItemSheetState>(null)
  const [txnSheet, setTxnSheet] = useState<{ item?: BudgetItem } | null>(null)

  if (budget.isPending) return <LoadingState />
  if (budget.isError) return <ErrorState error={budget.error} />
  const data = budget.data

  return (
    <>
      <PageHeader title={data.name} description={formatDateRange(data.period_start, data.period_end)} />

      <div className="flex flex-col gap-4">
        <Summary budget={data} />
        <ItemSection
          title="Income"
          kind="income"
          items={data.items.filter((i) => i.kind === 'income')}
          onOpenItem={(item) => setItemSheet({ kind: 'income', item })}
          onAdd={() => setItemSheet({ kind: 'income' })}
        />
        <ItemSection
          title="Expenses"
          kind="expense"
          items={data.items.filter((i) => i.kind === 'expense')}
          onOpenItem={(item) => setItemSheet({ kind: 'expense', item })}
          onAdd={() => setItemSheet({ kind: 'expense' })}
        />
        <Transactions budgetId={budgetId} />
        <DeleteBudget budgetId={budgetId} name={data.name} />
      </div>

      {/* Primary action, within thumb reach on phones. */}
      <Button
        onClick={() => setTxnSheet({})}
        className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 h-14 rounded-full px-5 shadow-lg"
      >
        <Plus className="size-5" />
        Log transaction
      </Button>

      <ItemSheet
        budgetId={budgetId}
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
        items={data.items}
        defaultItem={txnSheet?.item}
        open={txnSheet !== null}
        onOpenChange={(open) => !open && setTxnSheet(null)}
      />
    </>
  )
}

function Summary({ budget }: { budget: BudgetDetail }) {
  const leftToPlan = Number(budget.income.planned) - Number(budget.expense.planned)
  return (
    <Card className="grid grid-cols-3 gap-2 text-center">
      <Stat label="Income" value={budget.income.actual} of={budget.income.planned} />
      <Stat label="Spent" value={budget.expense.actual} of={budget.expense.planned} />
      <div>
        <p className="text-xs font-medium tracking-wide text-muted uppercase">Left to plan</p>
        <p className={cn('mt-1 text-lg font-semibold', leftToPlan < 0 && 'text-amber-700')}>
          {formatMoney(leftToPlan)}
        </p>
        <p className="text-xs text-muted">income − expenses</p>
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

/** One side of the budget, grouped by category (Uncategorized last). */
function ItemSection({
  title,
  kind,
  items,
  onOpenItem,
  onAdd,
}: {
  title: string
  kind: Kind
  items: BudgetItem[]
  onOpenItem: (item: BudgetItem) => void
  onAdd: () => void
}) {
  const groups = new Map<string, BudgetItem[]>()
  for (const item of items) {
    const group = item.category_name ?? 'Uncategorized'
    groups.set(group, [...(groups.get(group) ?? []), item])
  }
  // The API orders categorized items first; keep Uncategorized at the end regardless.
  const ordered = [...groups.entries()].sort(
    ([a], [b]) => Number(a === 'Uncategorized') - Number(b === 'Uncategorized'),
  )

  return (
    <Card className="p-0">
      <h2 className="px-4 pt-4 pb-1 text-lg font-semibold">{title}</h2>
      {ordered.map(([group, groupItems]) => (
        <div key={group} className="pb-1">
          <h3 className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">{group}</h3>
          <ul>
            {groupItems.map((item) => (
              <li key={item.id}>
                <ItemRow item={item} onClick={() => onOpenItem(item)} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {items.length === 0 && (
        <p className="px-4 pt-1 pb-2 text-muted">
          {kind === 'income' ? 'Plan what you expect to earn.' : 'Plan what you expect to spend.'}
        </p>
      )}
      <div className="border-t border-border p-2">
        <Button variant="ghost" onClick={onAdd} className="w-full text-accent">
          <Plus className="size-5" />
          Add {kind === 'income' ? 'income' : 'expense'}
        </Button>
      </div>
    </Card>
  )
}

function ItemRow({ item, onClick }: { item: BudgetItem; onClick: () => void }) {
  const actual = Number(item.actual_amount)
  const planned = Number(item.planned_amount)
  const ratio = planned > 0 ? Math.max(0, actual) / planned : actual > 0 ? 1 : 0
  const over = item.kind === 'expense' && actual > planned

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-1.5 px-4 py-2.5 text-left transition hover:bg-highlight"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{item.name}</span>
        <span className="shrink-0 text-sm text-muted">
          <span className={cn('font-semibold text-foreground', over && 'text-amber-700')}>
            {formatMoney(actual)}
          </span>{' '}
          of {formatMoney(planned)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-highlight">
        <div
          className={cn('h-full rounded-full', over ? 'bg-amber-500' : 'bg-accent')}
          style={{ width: `${Math.min(ratio, 1) * 100}%` }}
        />
      </div>
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
              <p className="truncate font-medium">{t.payee ?? t.budget_item_name}</p>
              <p className="truncate text-sm text-muted">
                {t.budget_item_name} · {formatShortDate(t.occurred_on)}
              </p>
            </div>
            <span className={cn('shrink-0 font-semibold', t.kind === 'income' && 'text-accent')}>
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
