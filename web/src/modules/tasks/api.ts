import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'

type Schemas = components['schemas']
export type Task = Schemas['TaskOut']
export type TaskDetail = Schemas['TaskDetail']
export type TaskType = Task['task_type']
export type RepeatUnit = NonNullable<Task['repeat_unit']>
export type TypeInfo = Schemas['TypeOut']
export type TaskFields = Schemas['TaskUpdate']

export const tasksKeys = {
  all: ['tasks'] as const,
  list: ['tasks', 'list'] as const,
  task: (id: string) => ['tasks', 'task', id] as const,
  types: ['tasks', 'types'] as const,
}

/** The four task types and how each works (fixed: they never change while the app runs). */
export function useTaskTypes() {
  return useQuery({
    queryKey: tasksKeys.types,
    queryFn: async () => unwrap(await api.GET('/tasks/types')),
    staleTime: Infinity,
  })
}

/** Active tasks with today's progress, soonest due first. */
export function useTasks() {
  return useQuery({
    queryKey: tasksKeys.list,
    queryFn: async () => unwrap(await api.GET('/tasks')),
  })
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: tasksKeys.task(id ?? ''),
    queryFn: async () => unwrap(await api.GET('/tasks/{task_id}', { params: { path: { task_id: id! } } })),
    enabled: id !== undefined,
  })
}

function useInvalidateTasks() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: tasksKeys.all })
}

export function useSaveTask() {
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: async (vars: { id: string; body: TaskFields } | { body: Schemas['TaskCreate'] }) =>
      unwrap(
        'id' in vars
          ? await api.PUT('/tasks/{task_id}', { params: { path: { task_id: vars.id } }, body: vars.body })
          : await api.POST('/tasks', { body: vars.body }),
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteTask() {
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE('/tasks/{task_id}', { params: { path: { task_id: id } } })
      if (error !== undefined || !response.ok) throw new Error('Could not delete task')
    },
    onSuccess: invalidate,
  })
}

/** Check a task off once (today), or take back the latest check-off. */
export function useCheck() {
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: async ({ id, undo }: { id: string; undo?: boolean }) =>
      unwrap(
        undo
          ? await api.POST('/tasks/{task_id}/undo', { params: { path: { task_id: id } } })
          : await api.POST('/tasks/{task_id}/complete', { params: { path: { task_id: id } } }),
      ),
    onSuccess: invalidate,
  })
}
