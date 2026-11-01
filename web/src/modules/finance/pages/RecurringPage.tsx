import { CircleHelp, Plus, Repeat } from 'lucide-react'
import { useState } from 'react'

import { useMe } from '@/shared/api/hooks'
import { cn } from '@/shared/lib/cn'
import { formatShortDate } from '@/shared/lib/dates'
import { formatMoney } from '@/shared/lib/money'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'
import { Segmented } from '@/shared/ui/segmented'

import { type Recurring, useRecurring } from '../api'
import { RecurringGuide } from '../components/RecurringGuide'
import { describeSchedule, RecurringSheet } from '../components/RecurringSheet'

const SECTIONS: { frequency: Recurring['frequency']; title: string }[] = [
  { frequency: 'monthly', title: 'Monthly' },
  { frequency: 'weekly', title: 'Weekly' },
  { frequency: 'quarterly', title: 'Quarterly' },
  { frequency: 'yearly', title: 'Yearly' },
]

/**
 * Where a rule lands in its period, for sorting: monthly by day of the month, weekly by
 * day of the week (from the user's week start), quarterly by the day of the month it
 * started on, yearly by its month and day.
 */
function landsOn(rule: Recurring, weekStartsOn: number): number {
  const start = new Date(`${rule.starts_on}T00:00`)
  switch (rule.frequency) {
    case 'monthly':
      return rule.day_of_month ?? 1
    case 'weekly':
      return ((rule.day_of_week ?? 1) - weekStartsOn + 7) % 7
    case 'quarterly':
      return start.getDate()
    case 'yearly':
      return start.getMonth() * 100 + start.getDate()
  }
}

type View = 'list' | 'condensed'

const VIEW_KEY = 'disci.finance.recurring-view'

/** Per-device convenience: remember the last view. */
function storedView(): View {
  try {
    if (localStorage.getItem(VIEW_KEY) === 'condensed') return 'condensed'
  } catch {
    // Storage can be unavailable (private mode); fall through to the default.
  }
  return 'list'
}

export function RecurringPage() {
  const rules = useRecurring()
  const [view, setView] = useState<View>(storedView)
  const me = useMe()
  const weekStartsOn = me.data?.week_starts_on ?? 1

  function chooseView(next: View) {
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // Not remembered; that's fine.
    }
  }
  const [sheet, setSheet] = useState<{ rule?: Recurring } | null>(null)
  const [guide, setGuide] = useState(false)

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title="Recurring"
          description="Subscriptions, bills and paychecks that repeat. Each is logged on its date."
        />
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="How recurring works" onClick={() => setGuide(true)}>
            <CircleHelp className="size-5" />
          </Button>
          <Button onClick={() => setSheet({})}>
            <Plus className="size-5" />
            New
          </Button>
        </div>
      </div>

      {rules.isPending && <LoadingState />}
      {rules.isError && <ErrorState error={rules.error} />}
      {rules.data?.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Repeat className="size-10 text-accent" />
          <h2 className="text-lg font-semibold">Nothing recurring yet</h2>
          <p className="max-w-sm text-muted">Add rent, subscriptions or a paycheck once and they log themselves.</p>
        </Card>
      )}

      {!!rules.data?.length && (
        <div className="mb-3 w-56">
          <Segmented
            label="View"
            value={view}
            onChange={chooseView}
            options={[
              { value: 'list', label: 'List' },
              { value: 'condensed', label: 'Condensed' },
            ]}
          />
        </div>
      )}

      <div className={cn('flex flex-col', view === 'list' ? 'gap-6' : 'gap-4')}>
        {SECTIONS.map(({ frequency, title }) => {
          const section = (rules.data ?? [])
            .filter((r) => r.frequency === frequency)
            .sort((a, b) => landsOn(a, weekStartsOn) - landsOn(b, weekStartsOn) || a.name.localeCompare(b.name))
          if (section.length === 0) return null
          return (
            <section key={frequency} className={cn('flex flex-col', view === 'list' ? 'gap-3' : 'gap-1.5')}>
              <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h2>
              {view === 'list' ? (
                section.map((rule) => <RuleCard key={rule.id} rule={rule} onOpen={() => setSheet({ rule })} />)
              ) : (
                <RuleTable rules={section} onOpen={(rule) => setSheet({ rule })} />
              )}
            </section>
          )
        })}
      </div>

      <RecurringSheet rule={sheet?.rule} open={sheet !== null} onOpenChange={(open) => !open && setSheet(null)} />
      <RecurringGuide open={guide} onOpenChange={setGuide} />
    </>
  )
}

/** One rule as a card: schedule, next date, item and how it applies. */
function RuleCard({ rule, onOpen }: { rule: Recurring; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="rounded-2xl text-left">
      <Card className={cn('flex flex-col gap-2 transition hover:bg-highlight', rule.paused && 'opacity-60')}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate font-semibold">{rule.name}</span>
          <span className={cn('shrink-0 font-semibold', rule.kind === 'income' && 'text-primary')}>
            {rule.kind === 'income' ? '+' : '−'}
            {formatMoney(rule.amount)}
          </span>
        </div>
        <p className="text-sm text-muted">
          {describeSchedule(rule)}
          {rule.paused
            ? ' · Paused'
            : rule.next_occurrence && ` · Next ${formatShortDate(rule.next_occurrence)}`}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Chip>
            {rule.item_name} · {rule.category_name ?? 'Uncategorized'}
          </Chip>
          <Chip>{rule.auto_apply ? 'Auto-applies' : 'Approve in Inbox'}</Chip>
        </div>
      </Card>
    </button>
  )
}

/**
 * One section as a compact table (name, next date, amount) with totals underneath.
 * Paused rules are listed but left out of the totals; income is totalled separately.
 */
function RuleTable({ rules, onOpen }: { rules: Recurring[]; onOpen: (rule: Recurring) => void }) {
  const active = rules.filter((r) => !r.paused)
  const sum = (kind: Recurring['kind']) =>
    active.filter((r) => r.kind === kind).reduce((total, r) => total + Number(r.amount), 0)
  const spend = sum('expense')
  const income = sum('income')
  const hasIncome = active.some((r) => r.kind === 'income')
  const hasExpense = active.some((r) => r.kind === 'expense')

  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full table-fixed text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-border">
            <th className="py-1.5 pl-3 text-left font-medium">Name</th>
            <th className="w-20 py-1.5 text-left font-medium">Next due</th>
            <th className="w-24 py-1.5 pr-3 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rules.map((rule) => (
            <tr
              key={rule.id}
              onClick={() => onOpen(rule)}
              className={cn('cursor-pointer transition hover:bg-highlight', rule.paused && 'opacity-60')}
            >
              <td className="truncate py-1.5 pl-3">
                {/* The row handles the click; the button makes it reachable by keyboard. */}
                <button type="button" className="max-w-full truncate text-left">
                  {rule.name}
                </button>
              </td>
              <td className="py-1.5 text-muted">
                {rule.paused ? 'Paused' : rule.next_occurrence ? formatShortDate(rule.next_occurrence) : '–'}
              </td>
              <td className={cn('py-1.5 pr-3 text-right tabular-nums', rule.kind === 'income' && 'text-primary')}>
                <Signed rule={rule} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-border font-semibold">
          {(hasExpense || !hasIncome) && (
            <tr>
              <td colSpan={2} className="py-1.5 pl-3">
                {hasIncome ? 'Total spend' : 'Total'}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">−{formatMoney(spend)}</td>
            </tr>
          )}
          {hasIncome && (
            <tr>
              <td colSpan={2} className="py-1.5 pl-3">
                Total income
              </td>
              <td className="py-1.5 pr-3 text-right text-primary tabular-nums">+{formatMoney(income)}</td>
            </tr>
          )}
        </tfoot>
      </table>
    </Card>
  )
}

function Signed({ rule }: { rule: Recurring }) {
  return (
    <>
      {rule.kind === 'income' ? '+' : '−'}
      {formatMoney(rule.amount)}
    </>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-background px-2.5 py-0.5 text-xs text-muted">{children}</span>
}
