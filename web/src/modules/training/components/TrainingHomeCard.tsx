import { Link } from '@tanstack/react-router'
import { Dumbbell } from 'lucide-react'

import { useMe } from '@/shared/api/hooks'
import { addDays, todayIn } from '@/shared/lib/dates'
import { ModuleCard } from '@/shared/ui/module-card'

import { useWorkouts } from '../api'
import { TYPE_LABELS, TYPE_ORDER, formatMiles, weekStart } from '../format'

/** Home card: this week's workouts by type, minutes and run miles. Opens the calendar. */
export function TrainingHomeCard() {
  const me = useMe()
  const today = todayIn(me.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
  const start = weekStart(today, me.data?.week_starts_on ?? 1)
  const workouts = useWorkouts({ start, end: addDays(start, 6), limit: 500 })

  const rows = workouts.data ?? []
  const minutes = Math.round(rows.reduce((t, w) => t + (w.time_in_sec ?? 0), 0) / 60)
  const runMiles = rows.filter((w) => w.type === 'run').reduce((t, w) => t + Number(w.miles ?? 0), 0)
  const counts = TYPE_ORDER.map((t) => ({ type: t, n: rows.filter((w) => w.type === t).length })).filter((c) => c.n > 0)

  const subtitle = !workouts.data
    ? 'Loading…'
    : rows.length === 0
      ? 'Nothing logged this week'
      : `${rows.length} ${rows.length === 1 ? 'workout' : 'workouts'} this week${minutes ? ` · ${minutes} min` : ''}`

  return (
    <Link to="/training/calendar" className="block rounded-2xl">
      <ModuleCard icon={Dumbbell} title="Training" subtitle={subtitle}>
        {counts.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {counts.map((c) => (
              <li key={c.type} className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{TYPE_LABELS[c.type]}s</span>
                <span className="text-muted">
                  {c.n}
                  {c.type === 'run' && runMiles > 0 ? ` · ${formatMiles(runMiles.toFixed(1))} mi` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ModuleCard>
    </Link>
  )
}
