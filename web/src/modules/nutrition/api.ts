import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'

type Schemas = components['schemas']
export type NutrientKey = Schemas['NutrientOut']['key']
export type Nutrient = Schemas['NutrientOut']
export type Food = Schemas['FoodOut']
export type FoodIn = Schemas['FoodIn']
export type LogEntry = Schemas['LogOut']
export type NutrientTotal = Schemas['NutrientTotal']
export type Day = Schemas['DayOut']
export type DaySummary = Schemas['DaySummary']
export type Goal = Schemas['GoalOut']
export type GoalKind = Goal['kind']

export const nutritionKeys = {
  all: ['nutrition'] as const,
  preferences: ['nutrition', 'preferences'] as const,
  foods: ['nutrition', 'foods'] as const,
  day: (date: string) => ['nutrition', 'day', date] as const,
  days: ['nutrition', 'days'] as const,
  goals: ['nutrition', 'goals'] as const,
}

// --- Preferences --------------------------------------------------------------------

export function usePreferences() {
  return useQuery({
    queryKey: nutritionKeys.preferences,
    queryFn: async () => unwrap(await api.GET('/nutrition/preferences')),
  })
}

/** The nutrients the user tracks, in display order (empty while loading). */
export function useTrackedNutrients(): Nutrient[] {
  const prefs = usePreferences()
  if (!prefs.data) return []
  return prefs.data.nutrients.filter((n) => prefs.data.tracked_nutrients.includes(n.key))
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (tracked: NutrientKey[]) =>
      unwrap(await api.PUT('/nutrition/preferences', { body: { tracked_nutrients: tracked } })),
    onSuccess: (prefs) => queryClient.setQueryData(nutritionKeys.preferences, prefs),
  })
}

// --- Food repo ------------------------------------------------------------------------

export function useFoods() {
  return useQuery({
    queryKey: nutritionKeys.foods,
    queryFn: async () => unwrap(await api.GET('/nutrition/foods')),
  })
}

/** Food edits change past days' numbers too, so everything nutrition is refreshed. */
export function useSaveFood() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: FoodIn & { id?: string }) =>
      unwrap(
        id
          ? await api.PUT('/nutrition/foods/{food_id}', { params: { path: { food_id: id } }, body })
          : await api.POST('/nutrition/foods', { body }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: nutritionKeys.all }),
  })
}

export function useDeleteFood() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE('/nutrition/foods/{food_id}', {
        params: { path: { food_id: id } },
      })
      if (error !== undefined || !response.ok) throw new Error('Could not delete food')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: nutritionKeys.all }),
  })
}

// --- Days and log entries ---------------------------------------------------------------

export function useDay(date: string) {
  return useQuery({
    queryKey: nutritionKeys.day(date),
    queryFn: async () =>
      unwrap(await api.GET('/nutrition/days/{day}', { params: { path: { day: date } } })),
  })
}

const PAGE = 30

/** Logged days, newest first, a page at a time. */
export function useDays() {
  return useInfiniteQuery({
    queryKey: nutritionKeys.days,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(await api.GET('/nutrition/days', { params: { query: { before: pageParam, limit: PAGE } } })),
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].date : undefined),
  })
}

/** Log changes touch a day, the history list and foods' "last logged": refresh them all. */
function useInvalidateNutrition() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: nutritionKeys.all })
}

export function useLogFood() {
  const invalidate = useInvalidateNutrition()
  return useMutation({
    mutationFn: async (body: Schemas['LogCreate']) => unwrap(await api.POST('/nutrition/logs', { body })),
    onSuccess: invalidate,
  })
}

export function useUpdateLog() {
  const invalidate = useInvalidateNutrition()
  return useMutation({
    mutationFn: async ({ id, ...body }: Schemas['LogUpdate'] & { id: string }) =>
      unwrap(await api.PUT('/nutrition/logs/{log_id}', { params: { path: { log_id: id } }, body })),
    onSuccess: invalidate,
  })
}

export function useDeleteLog() {
  const invalidate = useInvalidateNutrition()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE('/nutrition/logs/{log_id}', {
        params: { path: { log_id: id } },
      })
      if (error !== undefined || !response.ok) throw new Error('Could not delete entry')
    },
    onSuccess: invalidate,
  })
}

// --- Goals ---------------------------------------------------------------------------------

export function useGoals() {
  return useQuery({
    queryKey: nutritionKeys.goals,
    queryFn: async () => unwrap(await api.GET('/nutrition/goals')),
  })
}

export function useSaveGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      vars: { id: string; amount: string } | { nutrient: NutrientKey; kind: GoalKind; amount: string },
    ) =>
      unwrap(
        'id' in vars
          ? await api.PUT('/nutrition/goals/{goal_id}', {
              params: { path: { goal_id: vars.id } },
              body: { amount: vars.amount },
            })
          : await api.POST('/nutrition/goals', { body: vars }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: nutritionKeys.goals }),
  })
}

export function useDeleteGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE('/nutrition/goals/{goal_id}', {
        params: { path: { goal_id: id } },
      })
      if (error !== undefined || !response.ok) throw new Error('Could not delete goal')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: nutritionKeys.goals }),
  })
}
