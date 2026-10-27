import { Check, ChevronRight, Lightbulb, Minus } from 'lucide-react'

import { cn } from '@/shared/lib/cn'

import { type Task, useCheck } from '../api'
import { describeCadence, describeDue } from '../format'

/** One task in a list: its check control, name and a line of detail. Tapping the name opens it. */
export function TaskRow({ task, onOpen, showCadence }: { task: Task; onOpen: () => void; showCadence?: boolean }) {
  const due = describeDue(task)
  const overdue = task.due_status === 'overdue'
  const detail = [
    task.task_type === 'daily_checklist' && (task.daily_target ?? 1) > 1 && `${task.done_on_day} of ${task.daily_target} today`,
    showCadence && task.repeat_every && task.repeat_unit && describeCadence(task.repeat_every, task.repeat_unit),
    task.task_type === 'nondaily_maintenance' && task.done && 'Done today',
    task.task_type === 'adhoc_to_do' && task.done && 'Done',
    // Maintenance is due again even once done today; a finished to-do isn't.
    (!task.done || task.task_type === 'nondaily_maintenance') && due,
    task.description,
  ].filter(Boolean) as string[]
  // A finished to-do is crossed off; a finished daily item is too, until tomorrow.
  const crossed = task.done && task.task_type !== 'nondaily_maintenance'

  return (
    <div className="flex items-center gap-1 pl-2">
      {task.task_type === 'keep_in_mind' ? (
        <span className="flex size-11 shrink-0 items-center justify-center text-accent">
          <Lightbulb className="size-5" />
        </span>
      ) : (
        <CheckControl task={task} />
      )}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pr-3 text-left transition hover:bg-highlight"
      >
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate font-medium', crossed && 'text-muted line-through')}>{task.name}</span>
          {detail.length > 0 && (
            <span className="block truncate text-sm text-muted">
              {detail.map((d, i) => (
                <span key={i} className={cn(d === due && overdue && 'text-amber-700')}>
                  {i > 0 && ' · '}
                  {d}
                </span>
              ))}
            </span>
          )}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted" />
      </button>
    </div>
  )
}

/**
 * The round check button. Daily items with a target above 1 count up (2/5) and get a
 * small minus to take one back; everything else toggles done / not done.
 */
function CheckControl({ task }: { task: Task }) {
  const check = useCheck()
  const target = task.daily_target ?? 1
  const counting = task.task_type === 'daily_checklist' && target > 1
  // Toggles undo when done; counting items keep adding (past the target is fine).
  const undo = !counting && task.done
  const label = undo ? `Mark ${task.name} not done` : `Check off ${task.name}`

  return (
    <div className="flex shrink-0 items-center">
      {counting && task.done_on_day > 0 && (
        <button
          type="button"
          onClick={() => check.mutate({ id: task.id, undo: true })}
          disabled={check.isPending}
          aria-label={`Take one back from ${task.name}`}
          className="flex size-8 items-center justify-center rounded-full text-muted transition hover:bg-highlight disabled:opacity-50"
        >
          <Minus className="size-4" />
        </button>
      )}
      <button
        type="button"
        onClick={() => check.mutate({ id: task.id, undo })}
        disabled={check.isPending}
        aria-label={label}
        aria-pressed={task.done}
        className={cn(
          'flex size-11 items-center justify-center rounded-full transition disabled:opacity-60',
          'focus-visible:outline-2 focus-visible:outline-accent',
        )}
      >
        <span
          className={cn(
            'flex h-7 min-w-7 items-center justify-center rounded-full border-2 px-1 text-xs font-semibold',
            task.done ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted',
          )}
        >
          {task.done ? <Check className="size-4" /> : counting ? `${task.done_on_day}/${target}` : null}
        </span>
      </button>
    </div>
  )
}
