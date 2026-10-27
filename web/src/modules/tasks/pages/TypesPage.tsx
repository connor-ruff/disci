import { CalendarCheck, Lightbulb, ListTodo, type LucideIcon, Repeat } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'

import { type TaskType, useTaskTypes } from '../api'
import { type TaskSheetState, TaskSheet } from '../components/TaskSheet'

const ICONS: Record<TaskType, LucideIcon> = {
  daily_checklist: CalendarCheck,
  nondaily_maintenance: Repeat,
  adhoc_to_do: ListTodo,
  keep_in_mind: Lightbulb,
}

/** A guide to the four kinds of task and when to use each. */
export function TypesPage() {
  const types = useTaskTypes()
  const [sheet, setSheet] = useState<TaskSheetState>(null)

  return (
    <>
      <PageHeader title="Kinds of task" description="Every task is one of these four. Each behaves a little differently." />
      {types.isPending && <LoadingState />}
      {types.isError && <ErrorState error={types.error} />}
      <div className="flex flex-col gap-4">
        {types.data?.map((t) => {
          const Icon = ICONS[t.key]
          return (
            <Card key={t.key} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Icon className="size-6 shrink-0 text-accent" />
                <div>
                  <h2 className="font-semibold">{t.name}</h2>
                  <p className="text-sm text-muted">{t.summary}</p>
                </div>
              </div>
              <p className="text-sm">{t.how_it_works}</p>
              <ul className="flex flex-wrap gap-2">
                {t.examples.map((e) => (
                  <li key={e} className="rounded-full bg-background px-2.5 py-1 text-xs text-muted">
                    {e}
                  </li>
                ))}
              </ul>
              <Button variant="outline" onClick={() => setSheet({ newType: t.key })} className="self-start">
                Add one
              </Button>
            </Card>
          )
        })}
      </div>
      <TaskSheet state={sheet} onClose={() => setSheet(null)} />
    </>
  )
}
