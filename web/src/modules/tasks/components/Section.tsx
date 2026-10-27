import type { ReactNode } from 'react'

import { Card } from '@/shared/ui/card'

import type { Task } from '../api'
import { TaskRow } from './TaskRow'

/** A card of tasks under a heading, with an optional note on the right and footer below. */
export function Section({
  title,
  aside,
  hint,
  tasks,
  onOpen,
  showCadence,
  footer,
}: {
  title: string
  aside?: ReactNode
  hint?: ReactNode
  tasks: Task[]
  onOpen: (task: Task) => void
  showCadence?: boolean
  footer?: ReactNode
}) {
  return (
    <Card className="p-0">
      <div className="px-4 pt-4 pb-2">
        <h2 className="flex items-baseline justify-between gap-3 text-lg font-semibold">
          {title}
          {aside && <span className="shrink-0 text-sm font-normal text-muted">{aside}</span>}
        </h2>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      {tasks.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {tasks.map((t) => (
            <li key={t.id}>
              <TaskRow task={t} onOpen={() => onOpen(t)} showCadence={showCadence} />
            </li>
          ))}
        </ul>
      )}
      {footer && <div className="border-t border-border p-2">{footer}</div>}
    </Card>
  )
}
