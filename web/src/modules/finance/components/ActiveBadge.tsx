import { useMe } from '@/shared/api/hooks'
import { todayIn } from '@/shared/lib/dates'

import type { Budget } from '../api'

/** Whether today (in the user's timezone) falls inside the budget's effective range. */
export function useIsActive(budget: Pick<Budget, 'period_start' | 'period_end'>): boolean {
  const me = useMe()
  const today = todayIn(me.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
  // ISO dates compare correctly as strings.
  return budget.period_start <= today && today <= budget.period_end
}

/** "● Active" pill, shown only while the budget's period includes today. */
export function ActiveBadge({ budget }: { budget: Pick<Budget, 'period_start' | 'period_end'> }) {
  if (!useIsActive(budget)) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-highlight px-2.5 py-0.5 text-xs font-semibold">
      <span aria-hidden className="size-1.5 rounded-full bg-accent" />
      Active
    </span>
  )
}
