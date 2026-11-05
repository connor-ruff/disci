import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Flag, Smile, TriangleAlert } from 'lucide-react'
import { useState } from 'react'

import { useMe } from '@/shared/api/hooks'
import { cn } from '@/shared/lib/cn'
import { addDays, formatLongDate, formatShortDate, todayIn } from '@/shared/lib/dates'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { ErrorState, LoadingState } from '@/shared/ui/page'

import { type Plan, type PlanDay, type Week, type Workout, useWeeks, useWorkouts } from '../api'
import { LogWorkoutButton } from '../components/LogWorkoutButton'
import { WorkoutRow } from '../components/WorkoutRow'
import { type WorkoutSheetState, WorkoutSheet } from '../components/WorkoutSheet'
import { STATUS_STYLE, TYPE_BADGE, TYPE_LABELS, formatMiles, weekStart } from '../format'
import { weekSummary } from './HistoryPage'

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** A month of workouts, and the active plan laid over it: planned miles per day, each week
 * scored against its target. Tap a week to see each day's plan and what was done. */
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
  const last = addDays(weekStarts[weekStarts.length - 1], 6)
  const workouts = useWorkouts({ start: first, end: last, limit: 500 })
  const weeks = useWeeks(first, last)

  const plan = weeks.data?.plan ?? null
  const byDay = new Map<string, Workout[]>()
  for (const w of workouts.data ?? []) byDay.set(w.date, [...(byDay.get(w.date) ?? []), w])
  const planned = new Map<string, PlanDay>((weeks.data?.days ?? []).map((d) => [d.day_on, d]))
  const scores = new Map<string, Week>((weeks.data?.weeks ?? []).map((w) => [w.starts_on, w]))
  // Weekday headers follow the user's first day of the week.
  const letters = Array.from({ length: 7 }, (_, i) => DAY_LETTERS[(weekStartsOn - 1 + i) % 7])

  function go(delta: number) {
    setMonth(shiftMonth(month, delta))
    setSelected(null)
  }

  return (
    <>
      {weeks.data && (plan ? <PlanBanner plan={plan} daysToRace={weeks.data.days_to_race} /> : <StartPlanLink />)}

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
                <DayCell
                  key={d}
                  date={d}
                  inMonth={d.startsWith(month)}
                  isToday={d === today}
                  workouts={byDay.get(d) ?? []}
                  planned={planned.get(d)}
                />
              ))}
              <WeekTotal
                score={scores.get(start)}
                workouts={weekWorkouts}
                isFuture={start > today}
                selected={selected === start}
              />
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        {plan
          ? 'Small numbers are planned miles, bold numbers are miles done. Green: in range (±10%). Red: over. Yellow: under.'
          : 'Bold numbers are run miles. Letters are other workouts.'}{' '}
        Tap a week for details.
      </p>

      {(workouts.isPending || weeks.isPending) && <LoadingState />}
      {workouts.isError && <ErrorState error={workouts.error} />}
      {weeks.isError && <ErrorState error={weeks.error} />}

      {selected && workouts.data && weeks.data && (
        <WeekDetail
          start={selected}
          plan={plan}
          score={scores.get(selected)}
          byDay={byDay}
          planned={planned}
          today={today}
          onOpen={(w) => setSheet({ workout: w })}
        />
      )}

      <LogWorkoutButton onClick={() => setSheet({})} />
      <WorkoutSheet state={sheet} onClose={() => setSheet(null)} />
    </>
  )
}

function PlanBanner({ plan, daysToRace }: { plan: Plan; daysToRace: number | null }) {
  return (
    <Link to="/training/plan" className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm hover:bg-highlight">
      <Flag className="size-4 shrink-0 text-accent" />
      <span className="truncate font-medium">{plan.race_name ?? plan.name}</span>
      {plan.race_on && <span className="shrink-0 text-muted">{formatShortDate(plan.race_on)}</span>}
      <span className="flex-1" />
      {daysToRace != null && daysToRace >= 0 && (
        <span className="shrink-0 font-semibold text-accent">
          {daysToRace} {daysToRace === 1 ? 'day' : 'days'}
        </span>
      )}
    </Link>
  )
}

function StartPlanLink() {
  return (
    <Link
      to="/training/plan/new"
      className="mb-3 flex items-center gap-2 rounded-xl border border-dashed border-border bg-surface px-3 py-2.5 text-sm hover:bg-highlight"
    >
      <span className="flex-1 text-muted">Training for a race?</span>
      <span className="font-medium text-accent">Start a plan</span>
    </Link>
  )
}

function DayCell({
  date,
  inMonth,
  isToday,
  workouts,
  planned,
}: {
  date: string
  inMonth: boolean
  isToday: boolean
  workouts: Workout[]
  planned?: PlanDay
}) {
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
      <span className="flex w-full items-baseline justify-between gap-1">
        <span className={cn('text-[11px] leading-none', inMonth ? 'text-muted' : 'text-muted/60')}>{Number(date.slice(8))}</span>
        {planned && <span className="text-[11px] leading-none text-muted">{formatMiles(planned.planned_miles)}</span>}
      </span>
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

function WeekTotal({
  score,
  workouts,
  isFuture,
  selected,
}: {
  score?: Week
  workouts: Workout[]
  isFuture: boolean
  selected: boolean
}) {
  const status = score?.status ?? 'none'
  const ring = selected && 'ring-2 ring-accent'
  const box = 'flex min-h-16 flex-col items-center justify-center rounded-lg text-center'
  if (score && status !== 'none') {
    const target = score.target_miles ? formatMiles(score.target_miles) : ''
    return (
      <span className={cn(box, STATUS_STYLE[status], ring)}>
        {status === 'in_range' && <Smile className="size-4" aria-label="In range" />}
        {status === 'over' && <TriangleAlert className="size-4" aria-label="Over" />}
        {status === 'upcoming' ? (
          <>
            <span className="text-sm font-bold">{target}</span>
            <span className="text-[10px]">planned</span>
          </>
        ) : (
          <>
            <span className="text-sm font-bold">{formatMiles(score.miles_done)}</span>
            <span className="text-[10px]">/ {target}</span>
          </>
        )}
      </span>
    )
  }
  const runMiles = sumRunMiles(workouts)
  return (
    <span className={cn(box, 'bg-background', isFuture && 'text-muted', selected && 'bg-highlight', ring)}>
      {isFuture ? (
        <span className="text-sm">–</span>
      ) : runMiles > 0 ? (
        <>
          <span className="text-sm font-bold">{formatMiles(runMiles.toFixed(1))}</span>
          <span className="text-[10px] text-muted">run mi</span>
        </>
      ) : (
        <>
          <span className="text-sm font-bold">{workouts.length}</span>
          <span className="text-[10px] text-muted">{workouts.length === 1 ? 'workout' : 'workouts'}</span>
        </>
      )}
    </span>
  )
}

/** The status message for a week with a target (D6: the rules come from the API). */
function weekMessage(score: Week, plan: Plan): { title: string; text: string } | null {
  const done = formatMiles(score.miles_done)
  const target = score.target_miles ? formatMiles(score.target_miles) : ''
  const range = `${formatMiles(score.band_low ?? '0')}–${formatMiles(score.band_high ?? '0')} mi`
  const crossTrain = 'A bike ride, walk or lift will support your training more than another run.'
  switch (score.status) {
    case 'over':
      return { title: `${done} mi: over your ${range} range`, text: `Take it easy. ${crossTrain}` }
    case 'in_range':
      return { title: `${done} mi: weekly mileage met`, text: `Right inside your ${range} range. Nice work.` }
    case 'under':
      return { title: `${done} of ${target} mi`, text: `Below your ${range} range.` }
    case 'in_progress':
      return {
        title: `${done} of ${target} mi so far`,
        text: score.cross_train
          ? `You've reached ${plan.cross_train_at_pct}% of this week's target. ${crossTrain}`
          : `Range ${range}.`,
      }
    case 'upcoming':
      return { title: `Planned: ${target} mi`, text: `Range ${range} · ${score.runs_planned} planned runs.` }
    default:
      return null
  }
}

function WeekDetail({
  start,
  plan,
  score,
  byDay,
  planned,
  today,
  onOpen,
}: {
  start: string
  plan: Plan | null
  score?: Week
  byDay: Map<string, Workout[]>
  planned: Map<string, PlanDay>
  today: string
  onOpen: (w: Workout) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const workouts = days.flatMap((d) => byDay.get(d) ?? [])
  const message = plan && score ? weekMessage(score, plan) : null
  // With a plan every day shows (its plan and what was done); without one, only active days.
  const shownDays = plan ? days : days.filter((d) => byDay.has(d))

  return (
    <section className="mt-5 mb-20 flex flex-col gap-2">
      <div className="flex items-baseline gap-2 px-1">
        <h2 className="font-semibold">
          {formatShortDate(start)} – {formatShortDate(addDays(start, 6))}
        </h2>
        <span className="flex-1" />
        <span className="text-xs text-muted">
          {plan && score && score.status !== 'none' ? `${score.runs_done} of ${score.runs_planned} runs` : weekSummary(workouts)}
        </span>
      </div>
      {message && score && (
        <div className={cn('flex items-start gap-2 rounded-xl px-3 py-2.5', STATUS_STYLE[score.status])}>
          {score.status === 'in_range' && <Smile className="mt-0.5 size-5 shrink-0" />}
          {score.status === 'over' && <TriangleAlert className="mt-0.5 size-5 shrink-0" />}
          <div className="flex flex-col gap-0.5">
            <strong className="text-sm">{message.title}</strong>
            <span className="text-sm">{message.text}</span>
          </div>
        </div>
      )}
      {shownDays.length === 0 ? (
        <Card className="text-center text-sm text-muted">Nothing logged this week.</Card>
      ) : (
        shownDays.map((d) => {
          const plannedDay = planned.get(d)
          const dayWorkouts = byDay.get(d) ?? []
          return (
            <Card key={d} className="overflow-hidden p-0">
              <div className="flex items-baseline gap-2 px-4 pt-3">
                <h3 className="text-sm font-semibold">{formatLongDate(d).replace(/, \d{4}$/, '')}</h3>
                <span className="flex-1" />
                {plan && (
                  <span className="text-xs text-muted">
                    {plannedDay
                      ? `Plan: ${formatMiles(plannedDay.planned_miles)} mi${plannedDay.notes ? ` · ${plannedDay.notes}` : ''}`
                      : 'Rest'}
                  </span>
                )}
              </div>
              {dayWorkouts.length === 0 ? (
                <p className="px-4 pt-1 pb-3 text-sm text-muted">{d > today ? 'Coming up' : plannedDay ? 'No run logged' : 'Nothing logged'}</p>
              ) : (
                dayWorkouts.map((w) => <WorkoutRow key={w.id} workout={w} showDate={false} onOpen={() => onOpen(w)} />)
              )}
            </Card>
          )
        })
      )}
    </section>
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
