import { Dumbbell } from 'lucide-react'
import { useState } from 'react'

import { useMe } from '@/shared/api/hooks'
import { addDays, formatShortDate } from '@/shared/lib/dates'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'
import { Segmented } from '@/shared/ui/segmented'

import { type Workout, type WorkoutType, useWorkouts } from '../api'
import { LogWorkoutButton } from '../components/LogWorkoutButton'
import { WorkoutRow } from '../components/WorkoutRow'
import { type WorkoutSheetState, WorkoutSheet } from '../components/WorkoutSheet'
import { TYPE_LABELS, TYPE_ORDER, formatMiles, weekStart } from '../format'

const PAGE = 100

type Filter = WorkoutType | 'all'

/** Every workout, newest first, by week. Filter by activity; tap one to edit it. */
export function HistoryPage() {
  const me = useMe()
  const [filter, setFilter] = useState<Filter>('all')
  const [limit, setLimit] = useState(PAGE)
  const workouts = useWorkouts({ type: filter === 'all' ? undefined : filter, limit })
  const [sheet, setSheet] = useState<WorkoutSheetState>(null)

  const weeks = groupByWeek(workouts.data ?? [], me.data?.week_starts_on ?? 1)

  return (
    <>
      <PageHeader title="History" />
      <div className="mb-4">
        <Segmented
          label="Activity"
          size="sm"
          value={filter}
          onChange={(f) => {
            setFilter(f)
            setLimit(PAGE)
          }}
          options={[{ value: 'all', label: 'All' }, ...TYPE_ORDER.map((t) => ({ value: t, label: `${TYPE_LABELS[t]}s` }))]}
        />
      </div>

      {workouts.isPending && <LoadingState />}
      {workouts.isError && <ErrorState error={workouts.error} />}
      {workouts.data && workouts.data.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Dumbbell className="size-10 text-accent" />
          <h2 className="text-lg font-semibold">{filter === 'all' ? 'No workouts yet' : `No ${TYPE_LABELS[filter].toLowerCase()}s yet`}</h2>
          <p className="max-w-sm text-muted">Tap Log workout to add your first one.</p>
        </Card>
      )}

      <div className="mb-20 flex flex-col gap-4">
        {weeks.map((week) => (
          <section key={week.start} className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2 px-1">
              <h2 className="text-sm font-semibold">
                {formatShortDate(week.start)} – {formatShortDate(addDays(week.start, 6))}
              </h2>
              <span className="flex-1" />
              <span className="text-xs text-muted">{weekSummary(week.workouts)}</span>
            </div>
            <Card className="overflow-hidden p-0">
              {week.workouts.map((w) => (
                <WorkoutRow key={w.id} workout={w} onOpen={() => setSheet({ workout: w })} />
              ))}
            </Card>
          </section>
        ))}
        {workouts.data && workouts.data.length === limit && (
          <Button variant="outline" onClick={() => setLimit(limit + PAGE)}>
            Show more
          </Button>
        )}
      </div>

      <LogWorkoutButton onClick={() => setSheet({})} />
      <WorkoutSheet state={sheet} onClose={() => setSheet(null)} />
    </>
  )
}

function groupByWeek(workouts: Workout[], weekStartsOn: number): { start: string; workouts: Workout[] }[] {
  const weeks: { start: string; workouts: Workout[] }[] = []
  for (const w of workouts) {
    const start = weekStart(w.date, weekStartsOn)
    if (weeks.length === 0 || weeks[weeks.length - 1].start !== start) weeks.push({ start, workouts: [] })
    weeks[weeks.length - 1].workouts.push(w)
  }
  return weeks
}

/** "12.3 run mi · 4 workouts". */
export function weekSummary(workouts: Workout[]): string {
  const runMiles = workouts.filter((w) => w.type === 'run').reduce((t, w) => t + Number(w.miles ?? 0), 0)
  const count = `${workouts.length} ${workouts.length === 1 ? 'workout' : 'workouts'}`
  return runMiles > 0 ? `${formatMiles(runMiles.toFixed(1))} run mi · ${count}` : count
}
