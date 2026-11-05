import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'

type Schemas = components['schemas']
export type Workout = Schemas['WorkoutOut']
export type WorkoutBody = Schemas['WorkoutIn']
export type WorkoutType = Workout['type']
export type Lift = Schemas['LiftOut']

export type WorkoutFilter = { start?: string; end?: string; type?: WorkoutType; limit?: number }

export const trainingKeys = {
  all: ['training'] as const,
  workouts: (filter: WorkoutFilter) => ['training', 'workouts', filter] as const,
  lifts: ['training', 'lifts'] as const,
  locations: ['training', 'locations'] as const,
}

/** Workouts with their sets, newest first. */
export function useWorkouts(filter: WorkoutFilter) {
  return useQuery({
    queryKey: trainingKeys.workouts(filter),
    queryFn: async () => unwrap(await api.GET('/training/workouts', { params: { query: filter } })),
  })
}

/** The lift catalog, most recently done first, each with last time's sets. */
export function useLifts() {
  return useQuery({
    queryKey: trainingKeys.lifts,
    queryFn: async () => unwrap(await api.GET('/training/lifts')),
  })
}

/** Locations used before, most recent first. */
export function useLocations() {
  return useQuery({
    queryKey: trainingKeys.locations,
    queryFn: async () => unwrap(await api.GET('/training/locations')),
  })
}

function useInvalidateTraining() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: trainingKeys.all })
}

export function useSaveWorkout() {
  const invalidate = useInvalidateTraining()
  return useMutation({
    mutationFn: async ({ id, body }: { id?: string; body: WorkoutBody }) =>
      unwrap(
        id
          ? await api.PUT('/training/workouts/{workout_id}', { params: { path: { workout_id: id } }, body })
          : await api.POST('/training/workouts', { body }),
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteWorkout() {
  const invalidate = useInvalidateTraining()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE('/training/workouts/{workout_id}', {
        params: { path: { workout_id: id } },
      })
      if (error !== undefined || !response.ok) throw new Error('Could not delete workout')
    },
    onSuccess: invalidate,
  })
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export type Plan = Schemas['PlanOut']
export type PlanDetail = Schemas['PlanDetail']
export type PlanDay = Schemas['PlanDayIn']
export type PlanFields = Schemas['PlanIn']
export type PlanCreate = Schemas['PlanCreate']
export type Week = Schemas['WeekOut']
export type WeekStatus = Week['status']
export type Grid = Schemas['GridOut']

export const planKeys = {
  all: ['training', 'plans'] as const,
  list: ['training', 'plans', 'list'] as const,
  plan: (id: string) => ['training', 'plans', 'plan', id] as const,
  weeks: (start: string, end: string) => ['training', 'weeks', start, end] as const,
}

/** Every plan, the active one first. */
export function usePlans() {
  return useQuery({
    queryKey: planKeys.list,
    queryFn: async () => unwrap(await api.GET('/training/plans')),
  })
}

/** True once the user has any plan: the Plan tab shows from then on. */
export function useHasPlans() {
  return (usePlans().data?.length ?? 0) > 0
}

export function usePlan(id: string | undefined) {
  return useQuery({
    queryKey: planKeys.plan(id ?? ''),
    queryFn: async () => unwrap(await api.GET('/training/plans/{plan_id}', { params: { path: { plan_id: id! } } })),
    enabled: id !== undefined,
  })
}

/** Plan vs. done for every week overlapping start..end, and the active plan's days there. */
export function useWeeks(start: string, end: string) {
  return useQuery({
    queryKey: planKeys.weeks(start, end),
    queryFn: async () => unwrap(await api.GET('/training/weeks', { params: { query: { start, end } } })),
  })
}

/** Reads a pasted plan grid without saving it. */
export function useReadGrid() {
  return useMutation({
    mutationFn: async (text: string) => unwrap(await api.POST('/training/plans/grid', { body: { text } })),
  })
}

export function useCreatePlan() {
  const invalidate = useInvalidateTraining()
  return useMutation({
    mutationFn: async (body: PlanCreate) => unwrap(await api.POST('/training/plans', { body })),
    onSuccess: invalidate,
  })
}

export function useUpdatePlan() {
  const invalidate = useInvalidateTraining()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: PlanFields }) =>
      unwrap(await api.PUT('/training/plans/{plan_id}', { params: { path: { plan_id: id } }, body })),
    onSuccess: invalidate,
  })
}

export function useSetPlanActive() {
  const invalidate = useInvalidateTraining()
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) =>
      unwrap(await api.PUT('/training/plans/{plan_id}/active', { params: { path: { plan_id: id } }, body: { active } })),
    onSuccess: invalidate,
  })
}

export function useEditWeek() {
  const invalidate = useInvalidateTraining()
  return useMutation({
    mutationFn: async ({ id, startsOn, days, target }: { id: string; startsOn: string; days: PlanDay[]; target: string | null }) =>
      unwrap(
        await api.PUT('/training/plans/{plan_id}/weeks/{starts_on}', {
          params: { path: { plan_id: id, starts_on: startsOn } },
          body: { days, target_miles: target },
        }),
      ),
    onSuccess: invalidate,
  })
}

export function useReplaceDays() {
  const invalidate = useInvalidateTraining()
  return useMutation({
    mutationFn: async ({ id, days }: { id: string; days: PlanDay[] }) =>
      unwrap(await api.PUT('/training/plans/{plan_id}/days', { params: { path: { plan_id: id } }, body: { days } })),
    onSuccess: invalidate,
  })
}

export function useDeletePlan() {
  const invalidate = useInvalidateTraining()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE('/training/plans/{plan_id}', { params: { path: { plan_id: id } } })
      if (error !== undefined || !response.ok) throw new Error('Could not delete plan')
    },
    onSuccess: invalidate,
  })
}
