import { formatShortDate } from '@/shared/lib/dates'

import type { RepeatUnit, Task, TaskType } from './api'

/** Short labels for the four fixed types (the API's /tasks/types has the full guide). */
export const TYPE_LABELS: Record<TaskType, string> = {
  daily_checklist: 'Daily checklist',
  nondaily_maintenance: 'Maintenance',
  adhoc_to_do: 'To-do',
  keep_in_mind: 'Keep in mind',
}

export const TYPE_ORDER: TaskType[] = ['daily_checklist', 'nondaily_maintenance', 'adhoc_to_do', 'keep_in_mind']

export const UNITS: RepeatUnit[] = ['day', 'week', 'month', 'quarter', 'year']

/** "Every 2 weeks", "Every month". */
export function describeCadence(every: number, unit: RepeatUnit): string {
  return every === 1 ? `Every ${unit}` : `Every ${every} ${unit}s`
}

/** How a due date stands, worded gently: "Due today", "Due in 3 days", "2 days past due". */
export function describeDue(task: Pick<Task, 'next_due' | 'days_until_due'>): string | null {
  const days = task.days_until_due
  if (task.next_due == null || days == null) return null
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days === -1) return '1 day past due'
  if (days < 0) return `${-days} days past due`
  if (days < 7) return `Due in ${days} days`
  return `Due ${formatShortDate(task.next_due)}`
}
