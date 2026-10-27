import { Link } from '@tanstack/react-router'
import { ListChecks } from 'lucide-react'
import { useState } from 'react'

import { Card } from '@/shared/ui/card'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'

import { type Task, useTasks } from '../api'
import { NewTaskButton } from '../components/NewTaskButton'
import { Section } from '../components/Section'
import { type TaskSheetState, TaskSheet } from '../components/TaskSheet'

/** How far ahead "Coming up" looks. */
const SOON_DAYS = 7

/** What today asks of you: the daily checklist, what's due, what's coming, what to keep in mind. */
export function TodayPage() {
  const tasks = useTasks()
  const [sheet, setSheet] = useState<TaskSheetState>(null)
  const open = (t: Task) => setSheet({ taskId: t.id })

  const all = tasks.data ?? []
  const daily = all.filter((t) => t.task_type === 'daily_checklist')
  const dated = all.filter((t) => t.task_type === 'nondaily_maintenance' || t.task_type === 'adhoc_to_do')
  // Due now, then anything finished today (crossed off until tomorrow).
  const dueNow = [
    ...dated.filter((t) => !t.done && (t.due_status === 'overdue' || t.due_status === 'due_today')),
    ...dated.filter((t) => t.done),
  ]
  const soon = dated.filter(
    (t) => !t.done && t.due_status === 'upcoming' && (t.days_until_due ?? Infinity) <= SOON_DAYS,
  )
  const anytime = dated.filter((t) => !t.done && t.task_type === 'adhoc_to_do' && t.next_due == null)
  const keep = all.filter((t) => t.task_type === 'keep_in_mind')
  const dailyDone = daily.filter((t) => t.done).length

  return (
    <>
      <PageHeader title="Today" />

      {tasks.isPending && <LoadingState />}
      {tasks.isError && <ErrorState error={tasks.error} />}
      {tasks.data && all.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <ListChecks className="size-10 text-accent" />
          <h2 className="text-lg font-semibold">No tasks yet</h2>
          <p className="max-w-sm text-muted">
            Tap New task to add one.{' '}
            <Link to="/tasks/types" className="font-medium text-primary">
              See the four kinds
            </Link>{' '}
            to pick the right one.
          </p>
        </Card>
      )}

      {all.length > 0 && (
        <div className="mb-16 flex flex-col gap-4">
          {daily.length > 0 && (
            <Section title="Daily checklist" aside={`${dailyDone} of ${daily.length} done`} tasks={daily} onOpen={open} />
          )}
          {dueNow.length > 0 && <Section title="Due" tasks={dueNow} onOpen={open} />}
          {keep.length > 0 && <Section title="Keep in mind" tasks={keep} onOpen={open} />}
          {soon.length > 0 && <Section title="Coming up" hint="Due in the next week." tasks={soon} onOpen={open} />}
          {anytime.length > 0 && <Section title="Anytime" hint="To-dos without a due date." tasks={anytime} onOpen={open} />}
          {daily.length === 0 && dueNow.length === 0 && (
            <p className="text-center text-sm text-muted">Nothing due today.</p>
          )}
        </div>
      )}

      <NewTaskButton onClick={() => setSheet({})} />
      <TaskSheet state={sheet} onClose={() => setSheet(null)} />
    </>
  )
}
