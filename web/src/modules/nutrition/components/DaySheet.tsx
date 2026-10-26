import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, CircleAlert, Plus, Utensils } from 'lucide-react'
import { useState } from 'react'

import { useMe } from '@/shared/api/hooks'
import { cn } from '@/shared/lib/cn'
import { addDays, formatLongDate, todayIn } from '@/shared/lib/dates'
import { Button, buttonClasses } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { ErrorState, LoadingState } from '@/shared/ui/page'

import { type LogEntry, type Nutrient, type NutrientTotal, useDay, useTrackedNutrients } from '../api'
import { describeServing, formatNutrient } from '../format'
import { LogSheet } from './LogSheet'

/** Where a day's sheet lives: today is the Daily tab, any other day is under History. */
export function dayPath(date: string, today: string) {
  return date === today ? { to: '/nutrition/daily' as const } : { to: '/nutrition/history/$date' as const, params: { date } }
}

export function useToday(): string {
  const me = useMe()
  return todayIn(me.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
}

/** One day's food sheet: totals for the tracked nutrients, what was eaten, and logging. */
export function DaySheet({ date }: { date: string }) {
  const today = useToday()
  const day = useDay(date)
  const tracked = useTrackedNutrients()
  const [sheet, setSheet] = useState<{ entry?: LogEntry } | null>(null)

  const title = date === today ? 'Today' : date === addDays(today, -1) ? 'Yesterday' : formatLongDate(date).split(',')[0]

  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-muted">{formatLongDate(date)}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Link {...dayPath(addDays(date, -1), today)} aria-label="Previous day" className={buttonClasses('outline', 'icon')}>
            <ChevronLeft className="size-5" />
          </Link>
          {date < today && (
            <Link {...dayPath(addDays(date, 1), today)} aria-label="Next day" className={buttonClasses('outline', 'icon')}>
              <ChevronRight className="size-5" />
            </Link>
          )}
        </div>
      </div>

      {day.isPending && <LoadingState />}
      {day.isError && <ErrorState error={day.error} />}
      {day.data && (
        <div className="flex flex-col gap-4">
          <Totals totals={day.data.totals} tracked={tracked} hasEntries={day.data.entries.length > 0} />
          <Entries entries={day.data.entries} tracked={tracked} onOpen={(entry) => setSheet({ entry })} />
        </div>
      )}

      <Button
        onClick={() => setSheet({})}
        className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 h-12 rounded-full px-4 shadow-lg"
      >
        <Plus className="size-5" />
        Log food
      </Button>

      <LogSheet date={date} entry={sheet?.entry} open={sheet !== null} onOpenChange={(open) => !open && setSheet(null)} />
    </>
  )
}

/** The day's total for each tracked nutrient, with a callout for foods missing values. */
export function Totals({
  totals,
  tracked,
  hasEntries,
}: {
  totals: NutrientTotal[]
  tracked: Nutrient[]
  hasEntries: boolean
}) {
  const byKey = new Map(totals.map((t) => [t.nutrient, t]))
  const incomplete = tracked.filter((n) => (byKey.get(n.key)?.missing_foods.length ?? 0) > 0)

  if (tracked.length === 0) {
    return (
      <Card className="text-sm text-muted">
        You aren't tracking any nutrients.{' '}
        <Link to="/settings" className="font-medium text-primary">
          Choose some in Settings
        </Link>
        .
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {tracked.map((n) => {
          const total = byKey.get(n.key)
          const missing = (total?.missing_foods.length ?? 0) > 0
          return (
            <div key={n.key}>
              <dt className="flex items-center gap-1 text-xs font-medium tracking-wide text-muted uppercase">
                {n.label}
                {missing && <CircleAlert className="size-3.5 text-amber-600" aria-label="incomplete" />}
              </dt>
              <dd className={cn('text-lg font-semibold', !hasEntries && 'text-muted')}>
                {total?.amount == null ? '—' : formatNutrient(total.amount, n)}
              </dd>
            </div>
          )
        })}
      </dl>
      {incomplete.length > 0 && (
        <div className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
          <div>
            <p className="font-medium">Some foods have no value for these, so the totals may be low:</p>
            <ul className="mt-1">
              {incomplete.map((n) => (
                <li key={n.key}>
                  <span className="font-medium">{n.label}:</span> {byKey.get(n.key)!.missing_foods.join(', ')}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  )
}

function Entries({
  entries,
  tracked,
  onOpen,
}: {
  entries: LogEntry[]
  tracked: Nutrient[]
  onOpen: (entry: LogEntry) => void
}) {
  if (entries.length === 0) {
    return (
      <Card className="mb-16 flex flex-col items-center gap-3 py-10 text-center">
        <Utensils className="size-10 text-accent" />
        <h2 className="text-lg font-semibold">Nothing logged</h2>
        <p className="max-w-sm text-muted">Tap Log food to add what you ate from your food repo.</p>
      </Card>
    )
  }
  const [headline, ...rest] = tracked
  return (
    <Card className="mb-16 p-0">
      <h2 className="px-4 pt-4 pb-2 text-lg font-semibold">Food</h2>
      <ul className="divide-y divide-border">
        {entries.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onOpen(e)}
              className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition hover:bg-highlight"
            >
              <span className="flex w-full items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-medium">{e.food_name}</span>
                {headline && <NutrientValue entry={e} nutrient={headline} className="shrink-0 text-sm font-semibold" />}
              </span>
              <span className="text-sm text-muted">
                {describeServing(e.servings, e.standard_quantity, e.standard_unit)}
                {e.notes && ` · ${e.notes}`}
              </span>
              {rest.length > 0 && (
                <span className="flex flex-wrap gap-x-3 text-xs text-muted">
                  {rest.map((n) => (
                    <span key={n.key}>
                      <NutrientValue entry={e} nutrient={n} /> {n.label.toLowerCase()}
                    </span>
                  ))}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function NutrientValue({ entry, nutrient, className }: { entry: LogEntry; nutrient: Nutrient; className?: string }) {
  const value = entry.nutrients[nutrient.key]
  return value == null ? (
    <span className={cn('text-amber-700', className)}>? {nutrient.unit}</span>
  ) : (
    <span className={className}>{formatNutrient(value, nutrient)}</span>
  )
}
