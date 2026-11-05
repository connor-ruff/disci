import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { useMe } from '@/shared/api/hooks'
import { cn } from '@/shared/lib/cn'
import { addDays, formatLongDate, formatShortDate, todayIn } from '@/shared/lib/dates'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { ErrorState, LoadingState } from '@/shared/ui/page'

import { type Workout, useWorkouts } from '../api'
import { LogWorkoutButton } from '../components/LogWorkoutButton'
import { WorkoutRow } from '../components/WorkoutRow'
import { type WorkoutSheetState, WorkoutSheet } from '../components/WorkoutSheet'
import { TYPE_BADGE, TYPE_LABELS, formatMiles, weekStart } from '../format'
import { weekSummary } from './HistoryPage'

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** A month of workouts, a week per row with its total. Tap a week to see its workouts. */
export function CalendarPage() {
  const me = useMe()
  const today = todayIn(me.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
  const weekStartsOn = me.data?.week_starts_on ?? 1
  const [month, setMonth] = useState(today.slice(0, 7)) // YYYY-MM
  const [selected, setSelected] = useState<string | null>(weekStart(today, weekStartsOn))
  const [sheet, setSheet] = useState<WorkoutSheetState>(null)

  const first = weekStart(`${month}-01`, weekStartsOn)
  const lastOfMonth = addDays(`${shiftMonth(month, 1)}-01`, -1)
  const weekStarts: string[] = []
  for (let w = first; w <= lastOfMonth; w = addDays(w, 7)) weekStarts.push(w)
  const workouts = useWorkouts({ start: first, end: addDays(weekStarts[weekStarts.length - 1], 6), limit: 500 })

  const byDay = new Map<string, Workout[]>()
  for (const w of workouts.data ?? []) byDay.set(w.date, [...(byDay.get(w.date) ?? []), w])
  // Weekday headers follow the user's first day of the week.
  const letters = Array.from({ length: 7 }, (_, i) => DAY_LETTERS[(weekStartsOn - 1 + i) % 7])

  function go(delta: number) {
    setMonth(shiftMonth(month, delta))
    setSelected(null)
  }

  const selectedDays = selected ? Array.from({ length: 7 }, (_, i) => addDays(selected, i)) : []
  const selectedWorkouts = selectedDays.flatMap((d) => byDay.get(d) ?? [])

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => go(-1)}>
          <ChevronLeft className="size-5" />
        </Button>
        <h1 className="text-xl font-semibold">{monthTitle(month)}</h1>
        <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => go(1)}>
          <ChevronRight className="size-5" />
        </Button>
      </div>

      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_3.25rem] gap-[3px] text-center text-xs font-semibold text-muted">
        {letters.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
        <span>Week</span>
      </div>
      <div className="mt-1 flex flex-col gap-[3px]">
        {weekStarts.map((start) => {
          const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
          const weekWorkouts = days.flatMap((d) => byDay.get(d) ?? [])
          const runMiles = sumRunMiles(weekWorkouts)
          const isFuture = start > today
          return (
            <button
              key={start}
              type="button"
              onClick={() => setSelected(start)}
              aria-label={`Week of ${formatShortDate(start)}: ${weekSummary(weekWorkouts)}`}
              aria-pressed={selected === start}
              className="grid grid-cols-[repeat(7,minmax(0,1fr))_3.25rem] gap-[3px] text-left"
            >
              {days.map((d) => (
                <DayCell key={d} date={d} inMonth={d.startsWith(month)} isToday={d === today} workouts={byDay.get(d) ?? []} />
              ))}
              <span
                className={cn(
                  'flex min-h-16 flex-col items-center justify-center rounded-lg text-center',
                  selected === start ? 'bg-highlight ring-2 ring-accent' : 'bg-background',
                  isFuture && 'text-muted',
                )}
              >
                {isFuture ? (
                  <span className="text-sm">–</span>
                ) : runMiles > 0 ? (
                  <>
                    <span className="text-sm font-bold">{formatMiles(runMiles.toFixed(1))}</span>
                    <span className="text-[10px] text-muted">run mi</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-bold">{weekWorkouts.length}</span>
                    <span className="text-[10px] text-muted">{weekWorkouts.length === 1 ? 'workout' : 'workouts'}</span>
                  </>
                )}
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-muted">Bold numbers are run miles. Letters are other workouts. Tap a week for details.</p>

      {workouts.isPending && <LoadingState />}
      {workouts.isError && <ErrorState error={workouts.error} />}

      {selected && workouts.data && (
        <section className="mt-5 mb-20 flex flex-col gap-2">
          <div className="flex items-baseline gap-2 px-1">
            <h2 className="font-semibold">
              {formatShortDate(selected)} – {formatShortDate(addDays(selected, 6))}
            </h2>
            <span className="flex-1" />
            <span className="text-xs text-muted">{weekSummary(selectedWorkouts)}</span>
          </div>
          {selectedWorkouts.length === 0 ? (
            <Card className="text-center text-sm text-muted">Nothing logged this week.</Card>
          ) : (
            selectedDays
              .filter((d) => byDay.has(d))
              .map((d) => (
                <Card key={d} className="overflow-hidden p-0">
                  <h3 className="px-4 pt-3 text-sm font-semibold">{formatLongDate(d).replace(/, \d{4}$/, '')}</h3>
                  {byDay.get(d)!.map((w) => (
                    <WorkoutRow key={w.id} workout={w} showDate={false} onOpen={() => setSheet({ workout: w })} />
                  ))}
                </Card>
              ))
          )}
        </section>
      )}

      <LogWorkoutButton onClick={() => setSheet({})} />
      <WorkoutSheet state={sheet} onClose={() => setSheet(null)} />
    </>
  )
}

function DayCell({ date, inMonth, isToday, workouts }: { date: string; inMonth: boolean; isToday: boolean; workouts: Workout[] }) {
  const runMiles = sumRunMiles(workouts)
  const others = workouts.filter((w) => w.type !== 'run')
  return (
    <span
      className={cn(
        'flex min-h-16 flex-col items-start gap-0.5 overflow-hidden rounded-lg border p-1',
        inMonth ? 'border-border bg-surface' : 'border-transparent bg-background',
        isToday && 'border-2 border-accent',
      )}
    >
      <span className={cn('text-[11px] leading-none', inMonth ? 'text-muted' : 'text-muted/60')}>{Number(date.slice(8))}</span>
      {runMiles > 0 && <span className="text-sm leading-tight font-bold text-primary">{formatMiles(runMiles.toFixed(1))}</span>}
      <span className="flex flex-wrap gap-0.5">
        {others.map((w) => (
          <span key={w.id} className={cn('rounded px-1 text-[9px] leading-[14px] font-bold', TYPE_BADGE[w.type])}>
            {TYPE_LABELS[w.type][0]}
          </span>
        ))}
      </span>
    </span>
  )
}

function sumRunMiles(workouts: Workout[]): number {
  return workouts.filter((w) => w.type === 'run').reduce((t, w) => t + Number(w.miles ?? 0), 0)
}

/** "2026-11" moved by n months. */
function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

/** "2026-11" → "November 2026". */
function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
