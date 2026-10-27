import { Link } from '@tanstack/react-router'
import { ListChecks } from 'lucide-react'

import { Meter, ModuleCard } from '@/shared/ui/module-card'

import { useTasks } from '../api'

/** Home card: the daily checklist's progress and how many tasks are due. Opens Today. */
export function TasksHomeCard() {
  const tasks = useTasks()
  const all = tasks.data ?? []
  const daily = all.filter((t) => t.task_type === 'daily_checklist')
  const dailyDone = daily.filter((t) => t.done).length
  const due = all.filter((t) => !t.done && (t.due_status === 'overdue' || t.due_status === 'due_today'))
  const pastDue = due.filter((t) => t.due_status === 'overdue').length

  const subtitle = !tasks.data
    ? 'Loading…'
    : all.length === 0
      ? 'No tasks yet'
      : due.length === 0
        ? 'Nothing due today'
        : `${due.length} due${pastDue > 0 ? ` · ${pastDue} past due` : ''}`

  return (
    <Link to="/tasks/today" className="block rounded-2xl">
      <ModuleCard icon={ListChecks} title="Tasks" subtitle={subtitle}>
        {daily.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="flex items-baseline justify-between text-sm">
              <span className="font-medium">Daily checklist</span>
              <span className="text-muted">
                {dailyDone} / {daily.length}
              </span>
            </p>
            <Meter ratio={dailyDone / daily.length} />
          </div>
        )}
        {due.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {due.slice(0, 3).map((t) => (
              <li key={t.id} className="truncate">
                {t.name}
              </li>
            ))}
            {due.length > 3 && <li className="text-muted">and {due.length - 3} more</li>}
          </ul>
        )}
      </ModuleCard>
    </Link>
  )
}
