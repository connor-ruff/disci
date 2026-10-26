import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronRight, CircleAlert, History } from 'lucide-react'

import { formatLongDate } from '@/shared/lib/dates'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { inputClasses } from '@/shared/ui/field'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'

import { type DaySummary, type Nutrient, useDays, useTrackedNutrients } from '../api'
import { dayPath, useToday } from '../components/DaySheet'
import { formatNutrient } from '../format'

export function HistoryPage() {
  const days = useDays()
  const tracked = useTrackedNutrients()
  const today = useToday()
  const navigate = useNavigate()
  const all = days.data?.pages.flat() ?? []

  return (
    <>
      <PageHeader title="History" description="Every day you've logged food, newest first." />

      <label className="mb-4 flex items-center gap-3 text-sm font-medium">
        Go to a day
        <input
          type="date"
          max={today}
          onChange={(e) => e.target.value && navigate(dayPath(e.target.value, today))}
          className={inputClasses + ' w-auto flex-1'}
        />
      </label>

      {days.isPending && <LoadingState />}
      {days.isError && <ErrorState error={days.error} />}
      {days.data && all.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <History className="size-10 text-accent" />
          <h2 className="text-lg font-semibold">No days yet</h2>
          <p className="max-w-sm text-muted">Days show up here once you log food on them.</p>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {all.map((day) => (
          <DayCard key={day.date} day={day} tracked={tracked} today={today} />
        ))}
      </div>

      {days.hasNextPage && (
        <Button
          variant="outline"
          onClick={() => days.fetchNextPage()}
          disabled={days.isFetchingNextPage}
          className="mt-4 w-full"
        >
          {days.isFetchingNextPage ? 'Loading…' : 'Show older days'}
        </Button>
      )}
    </>
  )
}

function DayCard({ day, tracked, today }: { day: DaySummary; tracked: Nutrient[]; today: string }) {
  const byKey = new Map(day.totals.map((t) => [t.nutrient, t]))
  const incomplete = tracked.some((n) => (byKey.get(n.key)?.missing_foods.length ?? 0) > 0)
  return (
    <Link {...dayPath(day.date, today)} className="block rounded-2xl">
      <Card className="flex items-center gap-3 transition hover:bg-highlight">
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline justify-between gap-3">
            <span className="font-semibold">{day.date === today ? 'Today' : formatLongDate(day.date)}</span>
            <span className="shrink-0 text-sm text-muted">
              {day.entry_count} {day.entry_count === 1 ? 'food' : 'foods'}
            </span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted">
            {tracked.map((n) => {
              const amount = byKey.get(n.key)?.amount
              return (
                <span key={n.key}>
                  <span className="font-medium text-foreground">{amount == null ? '—' : formatNutrient(amount, n)}</span>{' '}
                  {n.key === 'calories' ? '' : n.label.toLowerCase()}
                </span>
              )
            })}
            {incomplete && (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <CircleAlert className="size-3.5" />
                missing values
              </span>
            )}
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted" />
      </Card>
    </Link>
  )
}
