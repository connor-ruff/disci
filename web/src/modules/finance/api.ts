import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'

type Schemas = components['schemas']
export type Kind = Schemas['CategoryOut']['kind']
export type Category = Schemas['CategoryOut']
export type Budget = Schemas['BudgetOut']
export type BudgetDetail = Schemas['BudgetDetail']
export type BudgetItem = Schemas['BudgetItemOut']
export type BudgetTransaction = Schemas['BudgetTransactionOut']
export type BudgetCreate = Schemas['BudgetCreate']
export type BudgetItemCreate = Schemas['BudgetItemCreate']
export type BudgetItemUpdate = Schemas['BudgetItemUpdate']
export type TransactionCreate = Schemas['TransactionCreate']

export const financeKeys = {
  all: ['finance'] as const,
  categories: ['finance', 'categories'] as const,
  budgets: ['finance', 'budgets'] as const,
  budget: (id: string) => ['finance', 'budget', id] as const,
  budgetTransactions: (id: string) => ['finance', 'budget', id, 'transactions'] as const,
}

// --- Categories --------------------------------------------------------------------

export function useCategories() {
  return useQuery({
    queryKey: financeKeys.categories,
    queryFn: async () => unwrap(await api.GET('/finance/categories')),
  })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { kind: Kind; name: string }) =>
      unwrap(await api.POST('/finance/categories', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKeys.categories }),
  })
}

export function useRenameCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) =>
      unwrap(
        await api.PUT('/finance/categories/{category_id}', {
          params: { path: { category_id: id } },
          body: { name },
        }),
      ),
    // Budgets show category names too.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKeys.all }),
  })
}

export function useDeleteCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE('/finance/categories/{category_id}', {
        params: { path: { category_id: id } },
      })
      if (error !== undefined || !response.ok) throw new Error('Could not delete category')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKeys.all }),
  })
}

// --- Budgets -----------------------------------------------------------------------

export function useBudgets() {
  return useQuery({
    queryKey: financeKeys.budgets,
    queryFn: async () => unwrap(await api.GET('/finance/budgets')),
  })
}

export function useBudget(id: string) {
  return useQuery({
    queryKey: financeKeys.budget(id),
    queryFn: async () =>
      unwrap(await api.GET('/finance/budgets/{budget_id}', { params: { path: { budget_id: id } } })),
  })
}

export function useCreateBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: BudgetCreate) => unwrap(await api.POST('/finance/budgets', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKeys.budgets }),
  })
}

export function useDeleteBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE('/finance/budgets/{budget_id}', {
        params: { path: { budget_id: id } },
      })
      if (error !== undefined || !response.ok) throw new Error('Could not delete budget')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKeys.budgets }),
  })
}

// --- Budget items (each returns the updated budget) ------------------------------------

function useBudgetMutation<TVars>(
  budgetId: string,
  request: (vars: TVars) => Promise<BudgetDetail>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: (budget) => queryClient.setQueryData(financeKeys.budget(budgetId), budget),
  })
}

export function useCreateItem(budgetId: string) {
  return useBudgetMutation(budgetId, async (body: BudgetItemCreate) =>
    unwrap(
      await api.POST('/finance/budgets/{budget_id}/items', {
        params: { path: { budget_id: budgetId } },
        body,
      }),
    ),
  )
}

export function useUpdateItem(budgetId: string) {
  return useBudgetMutation(budgetId, async ({ id, ...body }: BudgetItemUpdate & { id: string }) =>
    unwrap(await api.PUT('/finance/items/{item_id}', { params: { path: { item_id: id } }, body })),
  )
}

export function useDeleteItem(budgetId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/finance/items/{item_id}', { params: { path: { item_id: id } } })),
    onSuccess: (budget) => {
      queryClient.setQueryData(financeKeys.budget(budgetId), budget)
      return queryClient.invalidateQueries({ queryKey: financeKeys.budgetTransactions(budgetId) })
    },
  })
}

// --- Transactions --------------------------------------------------------------------

export function useBudgetTransactions(budgetId: string) {
  return useQuery({
    queryKey: financeKeys.budgetTransactions(budgetId),
    queryFn: async () =>
      unwrap(
        await api.GET('/finance/budgets/{budget_id}/transactions', {
          params: { path: { budget_id: budgetId } },
        }),
      ),
  })
}

/** Transactions can touch several budgets, so refresh all of them afterwards. */
export function useCreateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: TransactionCreate) =>
      unwrap(await api.POST('/finance/transactions', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['finance', 'budget'] }),
  })
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE('/finance/transactions/{transaction_id}', {
        params: { path: { transaction_id: id } },
      })
      if (error !== undefined || !response.ok) throw new Error('Could not delete transaction')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['finance', 'budget'] }),
  })
}
