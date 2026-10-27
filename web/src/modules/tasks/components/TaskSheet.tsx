import { Link } from '@tanstack/react-router'
import { CalendarDays, CircleHelp, History, Pencil, Repeat, Target } from 'lucide-react'
import { type FormEvent, type ReactNode, useState } from 'react'

import { errorMessage } from '@/shared/api/client'
import { cn } from '@/shared/lib/cn'
import { formatLongDate, formatShortDate } from '@/shared/lib/dates'
import { Button } from '@/shared/ui/button'
import { Field, inputClasses } from '@/shared/ui/field'
import { Sheet } from '@/shared/ui/sheet'

import {
  type RepeatUnit,
  type TaskDetail,
  type TaskType,
  useDeleteTask,
  useSaveTask,
  useTask,
  useTaskTypes,
} from '../api'
import { TYPE_LABELS, UNITS, describeCadence, describeDue } from '../format'

/** What the sheet shows: an existing task (view, then edit), or a new one (optionally of a type). */
export type TaskSheetState = { taskId: string } | { newType?: TaskType } | null

export function TaskSheet({ state, onClose }: { state: TaskSheetState; onClose: () => void }) {
  const taskId = state && 'taskId' in state ? state.taskId : undefined
  const task = useTask(taskId)
  const [editing, setEditing] = useState(false)

  function onOpenChange(open: boolean) {
    if (!open) {
      setEditing(false)
      onClose()
    }
  }

  const title = !taskId ? 'New task' : editing ? 'Edit task' : (task.data?.name ?? 'Task')
  return (
    <Sheet open={state !== null} onOpenChange={onOpenChange} title={title}>
      {state && !taskId && (
        <TaskForm key={'new' + (('newType' in state && state.newType) || '')} defaultType={'newType' in state ? state.newType : undefined} onDone={() => onOpenChange(false)} />
      )}
      {taskId && task.isPending && <p className="py-6 text-center text-muted">Loading…</p>}
      {taskId && task.isError && <p className="py-6 text-center text-red-700">Couldn't load this task.</p>}
      {taskId &&
        task.data &&
        (editing ? (
          <>
            <TaskForm key={task.data.id} task={task.data} onDone={() => setEditing(false)} />
            <Button variant="ghost" onClick={() => setEditing(false)} className="mt-2 w-full">
              Cancel
            </Button>
          </>
        ) : (
          <TaskFacts task={task.data} onEdit={() => setEditing(true)} onDeleted={() => onOpenChange(false)} />
        ))}
    </Sheet>
  )
}

function TaskFacts({ task, onEdit, onDeleted }: { task: TaskDetail; onEdit: () => void; onDeleted: () => void }) {
  const remove = useDeleteTask()
  const due = describeDue(task)
  const recent = task.recent_completions.slice(0, 10)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{TYPE_LABELS[task.task_type]}</p>

      <dl className="divide-y divide-border rounded-lg border border-border">
        {task.task_type === 'daily_checklist' && (
          <Fact icon={<Target className="size-4" />} label="Each day">
            {task.daily_target === 1 ? 'Once' : `${task.daily_target} times`}
            <span className="text-muted"> · {task.done_on_day} today</span>
          </Fact>
        )}
        {task.repeat_every && task.repeat_unit && (
          <Fact icon={<Repeat className="size-4" />} label="How often">
            {describeCadence(task.repeat_every, task.repeat_unit)}, roughly
          </Fact>
        )}
        {task.task_type !== 'daily_checklist' && task.task_type !== 'keep_in_mind' && (
          <Fact icon={<CalendarDays className="size-4" />} label={task.task_type === 'adhoc_to_do' ? 'Due' : 'Next due'}>
            {task.next_due ? (
              <>
                {formatLongDate(task.next_due)}
                {due && !(task.task_type === 'adhoc_to_do' && task.done) && (
                  <span className={cn('block text-muted', task.due_status === 'overdue' && 'text-amber-700')}>{due}</span>
                )}
              </>
            ) : (
              <span className="text-muted">No due date</span>
            )}
          </Fact>
        )}
        {task.task_type !== 'keep_in_mind' && (
          <Fact icon={<History className="size-4" />} label={task.task_type === 'adhoc_to_do' ? 'Done' : 'Last done'}>
            {task.last_done_on ? formatLongDate(task.last_done_on) : <span className="text-muted">Not yet</span>}
          </Fact>
        )}
      </dl>

      {task.description && <p className="whitespace-pre-wrap">{task.description}</p>}

      {task.task_type !== 'keep_in_mind' && task.task_type !== 'adhoc_to_do' && recent.length > 0 && (
        <div>
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Recently done</p>
          <p className="mt-1 text-sm">{recentDays(recent.map((c) => c.completed_on))}</p>
        </div>
      )}

      <Button onClick={onEdit}>
        <Pencil className="size-4" />
        Edit
      </Button>
      <Button
        variant="ghost"
        className="text-red-700"
        disabled={remove.isPending}
        onClick={() =>
          window.confirm(`Delete "${task.name}"? What you've done stays in your history.`) &&
          remove.mutate(task.id, { onSuccess: onDeleted })
        }
      >
        Delete task
      </Button>
    </div>
  )
}

/** "Oct 27 (×3), Oct 26, Oct 24": days, newest first, with counts for repeats. */
function recentDays(days: string[]): string {
  const counts = new Map<string, number>()
  for (const d of days) counts.set(d, (counts.get(d) ?? 0) + 1)
  return [...counts].map(([d, n]) => formatShortDate(d) + (n > 1 ? ` (×${n})` : '')).join(', ')
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <span className="mt-0.5 text-muted">{icon}</span>
      <dt className="w-24 shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm font-medium">{children}</dd>
    </div>
  )
}

/** New task (pick a type first) or edit one (its type is fixed). */
function TaskForm({ task, defaultType, onDone }: { task?: TaskDetail; defaultType?: TaskType; onDone: () => void }) {
  const types = useTaskTypes()
  const save = useSaveTask()
  const [type, setType] = useState<TaskType | undefined>(task?.task_type ?? defaultType)
  const [name, setName] = useState(task?.name ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [target, setTarget] = useState(String(task?.daily_target ?? 1))
  const [every, setEvery] = useState(String(task?.repeat_every ?? 1))
  const [unit, setUnit] = useState<RepeatUnit>(task?.repeat_unit ?? 'week')
  const [nextDue, setNextDue] = useState(task?.next_due ?? '')
  const [invalid, setInvalid] = useState<string | null>(null)

  if (!type) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted">What kind of task is it?</p>
        {(types.data ?? []).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setType(t.key)}
            className="rounded-lg border border-border px-3 py-2.5 text-left transition hover:bg-highlight"
          >
            <span className="block font-medium">{t.name}</span>
            <span className="block text-sm text-muted">{t.summary}</span>
          </button>
        ))}
        {types.isPending && <p className="text-muted">Loading…</p>}
        <Link to="/tasks/types" className="mt-1 inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary">
          <CircleHelp className="size-4" />
          More about the types
        </Link>
      </div>
    )
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const whole = (v: string) => /^\d+$/.test(v.trim()) && Number(v) >= 1
    if (type === 'daily_checklist' && !whole(target)) return setInvalid('Times a day must be a whole number, 1 or more')
    if (type === 'nondaily_maintenance' && !whole(every)) return setInvalid('How often must be a whole number, 1 or more')
    if (type === 'nondaily_maintenance' && task && !nextDue) return setInvalid('Pick when it’s next due')
    setInvalid(null)
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      daily_target: type === 'daily_checklist' ? Number(target) : null,
      repeat_every: type === 'nondaily_maintenance' ? Number(every) : null,
      repeat_unit: type === 'nondaily_maintenance' ? unit : null,
      // Maintenance without a date starts today (the API's default).
      next_due: nextDue || null,
    }
    const vars = task ? { id: task.id, body } : { body: { ...body, task_type: type! } }
    save.mutate(vars, { onSuccess: onDone })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{TYPE_LABELS[type]}</p>
        {!task && (
          <button type="button" onClick={() => setType(undefined)} className="text-sm font-medium text-primary">
            Change type
          </button>
        )}
      </div>

      <Field label="Name" htmlFor="task-name">
        <input
          id="task-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          placeholder={types.data?.find((t) => t.key === type)?.examples[0]}
          className={inputClasses}
        />
      </Field>

      {type === 'daily_checklist' && (
        <Field label="Times a day" htmlFor="task-target" hint="Check it off this many times to finish it for the day.">
          <input
            id="task-target"
            inputMode="numeric"
            required
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={inputClasses}
          />
        </Field>
      )}

      {type === 'nondaily_maintenance' && (
        <>
          <Field label="How often (roughly)" hint="After you do it, it's due again this long after.">
            <div className="flex items-center gap-2">
              <span className="text-sm">Every</span>
              <input
                aria-label="How many"
                inputMode="numeric"
                required
                value={every}
                onChange={(e) => setEvery(e.target.value)}
                className={cn(inputClasses, 'w-20 shrink-0')}
              />
              <select
                aria-label="Unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value as RepeatUnit)}
                className={cn(inputClasses, 'min-w-0 flex-1')}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {Number(every) === 1 ? u : `${u}s`}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field label="Next due" htmlFor="task-due" hint={task ? 'Move it to snooze.' : 'Leave empty to start today.'}>
            <input id="task-due" type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} className={inputClasses} />
          </Field>
        </>
      )}

      {type === 'adhoc_to_do' && (
        <Field label="Due date (optional)" htmlFor="task-due">
          <input id="task-due" type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} className={inputClasses} />
        </Field>
      )}

      <Field label="Description (optional)" htmlFor="task-description">
        <textarea
          id="task-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
          rows={2}
          className={inputClasses + ' h-auto py-2'}
        />
      </Field>

      {(invalid || save.isError) && <p className="text-sm text-red-700">{invalid ?? errorMessage(save.error)}</p>}

      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? 'Saving…' : task ? 'Save' : 'Add task'}
      </Button>
    </form>
  )
}
