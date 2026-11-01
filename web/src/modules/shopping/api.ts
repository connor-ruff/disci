import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'

type Schemas = components['schemas']
export type ShoppingType = Schemas['ShoppingTypeOut']
export type Item = Schemas['ItemOut']
export type CommonItem = Schemas['CommonOut']
export type ItemFields = Schemas['ItemUpdate']

export const shoppingKeys = {
  all: ['shopping'] as const,
  types: ['shopping', 'types'] as const,
  items: ['shopping', 'items'] as const,
  common: ['shopping', 'common'] as const,
}

/** Refetch everything: list changes move common items' "on list", and type changes move both. */
function useInvalidateShopping() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: shoppingKeys.all })
}

// --- Types ---------------------------------------------------------------------------

export function useTypes() {
  return useQuery({
    queryKey: shoppingKeys.types,
    queryFn: async () => unwrap(await api.GET('/shopping/types')),
  })
}

export function useCreateType() {
  const invalidate = useInvalidateShopping()
  return useMutation({
    mutationFn: async (name: string) => unwrap(await api.POST('/shopping/types', { body: { name } })),
    onSuccess: invalidate,
  })
}

export function useRenameType() {
  const invalidate = useInvalidateShopping()
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) =>
      unwrap(await api.PUT('/shopping/types/{type_id}', { params: { path: { type_id: id } }, body: { name } })),
    onSuccess: invalidate,
  })
}

export function useDeleteType() {
  const invalidate = useInvalidateShopping()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE('/shopping/types/{type_id}', { params: { path: { type_id: id } } })
      if (error !== undefined || !response.ok) throw new Error('Could not delete type')
    },
    onSuccess: invalidate,
  })
}

export function useReorderTypes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => unwrap(await api.PUT('/shopping/types/order', { body: { ids } })),
    // Show the new order immediately; the server's answer replaces it.
    onMutate: (ids) => {
      queryClient.setQueryData<ShoppingType[]>(shoppingKeys.types, (old) =>
        old && [...old].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)),
      )
    },
    onSuccess: (types) => queryClient.setQueryData(shoppingKeys.types, types),
  })
}

// --- List items ----------------------------------------------------------------------

export function useItems() {
  return useQuery({
    queryKey: shoppingKeys.items,
    queryFn: async () => unwrap(await api.GET('/shopping/items')),
  })
}

export function useAddItem() {
  const invalidate = useInvalidateShopping()
  return useMutation({
    mutationFn: async (body: Schemas['ItemCreate']) => unwrap(await api.POST('/shopping/items', { body })),
    onSuccess: invalidate,
  })
}

export function useUpdateItem() {
  const invalidate = useInvalidateShopping()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: ItemFields }) =>
      unwrap(await api.PUT('/shopping/items/{item_id}', { params: { path: { item_id: id } }, body })),
    onSuccess: invalidate,
  })
}

/** Cross an item off, or put it back. Shown right away; the server's answer follows. */
export function useSetDone() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateShopping()
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) =>
      unwrap(await api.PUT('/shopping/items/{item_id}/done', { params: { path: { item_id: id } }, body: { done } })),
    onMutate: ({ id, done }) => {
      queryClient.setQueryData<Item[]>(shoppingKeys.items, (old) =>
        old?.map((i) => (i.id === id ? { ...i, done, done_at: done ? new Date().toISOString() : null } : i)),
      )
    },
    onSettled: invalidate,
  })
}

export function useDeleteItem() {
  const invalidate = useInvalidateShopping()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE('/shopping/items/{item_id}', { params: { path: { item_id: id } } })
      if (error !== undefined || !response.ok) throw new Error('Could not remove item')
    },
    onSuccess: invalidate,
  })
}

/** Remove one type's crossed-off items (null = Uncategorized). */
export function useClearDone() {
  const invalidate = useInvalidateShopping()
  return useMutation({
    mutationFn: async (typeId: string | null) =>
      unwrap(await api.POST('/shopping/items/clear-done', { body: { all_types: false, shopping_type_id: typeId } })),
    onSuccess: invalidate,
  })
}

export function useReorderItems() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => unwrap(await api.PUT('/shopping/items/order', { body: { ids } })),
    // Show the new order immediately; the server's answer replaces it.
    onMutate: (ids) => {
      queryClient.setQueryData<Item[]>(shoppingKeys.items, (old) =>
        old && [...old].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)),
      )
    },
    onSuccess: (items) => queryClient.setQueryData(shoppingKeys.items, items),
  })
}

// --- Common items --------------------------------------------------------------------

export function useCommon() {
  return useQuery({
    queryKey: shoppingKeys.common,
    queryFn: async () => unwrap(await api.GET('/shopping/common')),
  })
}

export function useSaveCommon() {
  const invalidate = useInvalidateShopping()
  return useMutation({
    mutationFn: async (vars: { id?: string; body: Schemas['CommonIn'] }) =>
      unwrap(
        vars.id
          ? await api.PUT('/shopping/common/{common_id}', { params: { path: { common_id: vars.id } }, body: vars.body })
          : await api.POST('/shopping/common', { body: vars.body }),
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteCommon() {
  const invalidate = useInvalidateShopping()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE('/shopping/common/{common_id}', {
        params: { path: { common_id: id } },
      })
      if (error !== undefined || !response.ok) throw new Error('Could not delete common item')
    },
    onSuccess: invalidate,
  })
}

/** Put a copy of a common item on the list (the API skips one that's already there). */
export function useAddCommonToList() {
  const invalidate = useInvalidateShopping()
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.POST('/shopping/common/{common_id}/add', { params: { path: { common_id: id } } })),
    onSuccess: invalidate,
  })
}
