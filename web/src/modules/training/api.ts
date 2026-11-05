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
