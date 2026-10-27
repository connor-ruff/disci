import { Plus } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/shared/ui/button'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'

import { useTaskTypes, useTasks } from '../api'
import { NewTaskButton } from '../components/NewTaskButton'
import { Section } from '../components/Section'
import { type TaskSheetState, TaskSheet } from '../components/TaskSheet'
import { TYPE_LABELS, TYPE_ORDER } from '../format'

/** Every active task, by type: where tasks are added, changed and removed. */
export function AllTasksPage() {
  const tasks = useTasks()
  const types = useTaskTypes()
  const [sheet, setSheet] = useState<TaskSheetState>(null)

  return (
    <>
      <PageHeader title="All tasks" description="Everything you're keeping track of, by kind. Tap one to see or change it." />

      {tasks.isPending && <LoadingState />}
      {tasks.isError && <ErrorState error={tasks.error} />}
      {tasks.data && (
        <div className="mb-16 flex flex-col gap-4">
          {TYPE_ORDER.map((type) => {
            const rows = tasks.data.filter((t) => t.task_type === type)
            return (
              <Section
                key={type}
                title={TYPE_LABELS[type]}
                aside={rows.length > 0 ? rows.length : undefined}
                hint={types.data?.find((t) => t.key === type)?.summary}
                tasks={rows}
                onOpen={(t) => setSheet({ taskId: t.id })}
                showCadence
                footer={
                  <Button variant="ghost" onClick={() => setSheet({ newType: type })} className="w-full text-primary">
                    <Plus className="size-5" />
                    Add {TYPE_LABELS[type].toLowerCase()}
                  </Button>
                }
              />
            )
          })}
        </div>
      )}

      <NewTaskButton onClick={() => setSheet({})} />
      <TaskSheet state={sheet} onClose={() => setSheet(null)} />
    </>
  )
}
