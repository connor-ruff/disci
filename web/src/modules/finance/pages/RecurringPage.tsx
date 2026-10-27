import { CircleHelp, Plus, Repeat } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/shared/lib/cn'
import { formatShortDate } from '@/shared/lib/dates'
import { formatMoney } from '@/shared/lib/money'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'

import { type Recurring, useRecurring } from '../api'
import { RecurringGuide } from '../components/RecurringGuide'
import { describeSchedule, RecurringSheet } from '../components/RecurringSheet'

export function RecurringPage() {
  const rules = useRecurring()
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

      <div className="flex flex-col gap-3">
        {rules.data?.map((rule) => (
          <button key={rule.id} type="button" onClick={() => setSheet({ rule })} className="rounded-2xl text-left">
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
        ))}
      </div>

      <RecurringSheet rule={sheet?.rule} open={sheet !== null} onOpenChange={(open) => !open && setSheet(null)} />
      <RecurringGuide open={guide} onOpenChange={setGuide} />
    </>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-background px-2.5 py-0.5 text-xs text-muted">{children}</span>
}
