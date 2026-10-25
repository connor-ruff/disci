import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap, type UserUpdate } from './client'

export const queryKeys = {
  me: ['me'] as const,
  modules: ['me', 'modules'] as const,
}

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: async () => unwrap(await api.GET('/me')) })
}

export function useUpdateMe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: UserUpdate) => unwrap(await api.PUT('/me', { body })),
    onSuccess: (user) => queryClient.setQueryData(queryKeys.me, user),
  })
}

/** Every available module, with whether the current user has it turned on. */
export function useModules() {
  return useQuery({
    queryKey: queryKeys.modules,
    queryFn: async () => unwrap(await api.GET('/me/modules')),
  })
}

export function useSetModuleEnabled() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const params = { params: { path: { key } } }
      return unwrap(
        enabled
          ? await api.PUT('/me/modules/{key}', params)
          : await api.DELETE('/me/modules/{key}', params),
      )
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.modules }),
  })
}
