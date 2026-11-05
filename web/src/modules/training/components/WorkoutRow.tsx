import { cn } from '@/shared/lib/cn'
import { formatShortDate } from '@/shared/lib/dates'

import type { Workout } from '../api'
import { TYPE_BADGE, TYPE_LABELS, liftGroups, workoutDetail, workoutTitle } from '../format'

/** One workout in a list: badge, title, details, lift sets and reflection. Tap to edit. */
export function WorkoutRow({ workout, onOpen, showDate = true }: { workout: Workout; onOpen: () => void; showDate?: boolean }) {
  const detail = workoutDetail(workout)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-3 border-t border-border px-4 py-3 text-left first:border-t-0 hover:bg-highlight"
    >
      <span
        aria-hidden="true"
        className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold', TYPE_BADGE[workout.type])}
      >
        {TYPE_LABELS[workout.type][0]}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className="font-medium">{workoutTitle(workout)}</span>
          <span className="flex-1" />
          {showDate && <span className="shrink-0 text-xs text-muted">{formatShortDate(workout.date)}</span>}
        </span>
        {detail && <span className="text-sm text-muted">{detail}</span>}
        {liftGroups(workout).map((g, i) => (
          <span key={i} className="text-sm">
            <span className="font-medium text-violet-800">{g.name}</span> <span className="text-muted">{g.sets}</span>
          </span>
        ))}
        {workout.reflection && <span className="mt-1 text-sm text-muted italic">“{workout.reflection}”</span>}
      </span>
    </button>
  )
}
