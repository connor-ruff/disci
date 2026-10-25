import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'

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
export type TransactionUpdate = Schemas['TransactionUpdate']
export type TransactionDetail = Schemas['TransactionDetail']

export const financeKeys = {
  all: ['finance'] as const,
  categories: ['finance', 'categories'] as const,
  budgets: ['finance', 'budgets'] as const,
  budget: (id: string) => ['finance', 'budget', id] as const,
  budgetTransactions: (id: string) => ['finance', 'budget', id, 'transactions'] as const,
  transaction: (id: string) => ['finance', 'transaction', id] as const,
  inbox: ['finance', 'inbox'] as const,
  recurring: ['finance', 'recurring'] as const,
  checklist: ['finance', 'checklist'] as const,
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
    mutationFn: async (body: { kind: Kind; name: string; description: string | null }) =>
      unwrap(await api.POST('/finance/categories', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKeys.categories }),
  })
}

export function useRenameCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; name: string; description: string | null }) =>
      unwrap(
        await api.PUT('/finance/categories/{category_id}', {
          params: { path: { category_id: id } },
          body,
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
    onSuccess: (budget) => {
      queryClient.setQueryData(financeKeys.budget(budgetId), budget)
      return queryClient.invalidateQueries({ queryKey: financeKeys.checklist })
    },
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

/** Transactions can touch several budgets, the inbox and the checklist: refresh them all. */
export function useCreateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: TransactionCreate) =>
      unwrap(await api.POST('/finance/transactions', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKeys.all }),
  })
}

/** One transaction with every budget item it counts toward. */
export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: financeKeys.transaction(id ?? ''),
    queryFn: async () =>
      unwrap(
        await api.GET('/finance/transactions/{transaction_id}', {
          params: { path: { transaction_id: id! } },
        }),
      ),
    enabled: id !== undefined,
  })
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: TransactionUpdate & { id: string }) =>
      unwrap(
        await api.PUT('/finance/transactions/{transaction_id}', {
          params: { path: { transaction_id: id } },
          body,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKeys.all }),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKeys.all }),
  })
}

// --- Ordering ----------------------------------------------------------------------

export function useReorderCategories() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { kind: Kind; ids: string[] }) =>
      unwrap(await api.PUT('/finance/categories/order', { body })),
    // Show the new order immediately; the server's answer replaces it.
    onMutate: ({ ids }) => {
      queryClient.setQueryData<Category[]>(financeKeys.categories, (old) =>
        old?.map((c) => (ids.includes(c.id) ? { ...c, sort_order: ids.indexOf(c.id) + 1 } : c)),
      )
    },
    onSuccess: (categories) => {
      queryClient.setQueryData(financeKeys.categories, categories)
      // Budgets group items by category order.
      return queryClient.invalidateQueries({ queryKey: ['finance', 'budget'] })
    },
  })
}

export function useReorderItems(budgetId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) =>
      unwrap(
        await api.PUT('/finance/budgets/{budget_id}/items/order', {
          params: { path: { budget_id: budgetId } },
          body: { ids },
        }),
      ),
    // Show the new order immediately; the server's answer replaces it.
    onMutate: (ids) => {
      queryClient.setQueryData<BudgetDetail>(financeKeys.budget(budgetId), (old) =>
        old && {
          ...old,
          items: [...old.items].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)),
        },
      )
    },
    onSuccess: (budget) => queryClient.setQueryData(financeKeys.budget(budgetId), budget),
  })
}

// --- Inbox: approvals and unassigned ----------------------------------------------------

export type InboxTransaction = Schemas['InboxTransactionOut']

export function useInbox() {
  return useQuery({
    queryKey: financeKeys.inbox,
    queryFn: async () => unwrap(await api.GET('/finance/inbox')),
  })
}

/** Anything that changes transactions refreshes budgets, the inbox and the checklist. */
function useInvalidateMoney() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: financeKeys.all })
}

export function useApprove() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount?: string }) =>
      unwrap(
        await api.POST('/finance/transactions/{transaction_id}/approve', {
          params: { path: { transaction_id: id } },
          body: { amount: amount ?? null },
        }),
      ),
    onSuccess: invalidate,
  })
}

export function useReject() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.POST('/finance/transactions/{transaction_id}/reject', {
        params: { path: { transaction_id: id } },
      })
      if (error !== undefined || !response.ok) throw new Error('Could not reject transaction')
    },
    onSuccess: invalidate,
  })
}

export function useAssign() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async ({ id, itemId, amount }: { id: string; itemId: string; amount: string }) =>
      unwrap(
        await api.PUT('/finance/transactions/{transaction_id}/allocations', {
          params: { path: { transaction_id: id } },
          body: { allocations: [{ budget_item_id: itemId, amount }] },
        }),
      ),
    onSuccess: invalidate,
  })
}

// --- Recurring ---------------------------------------------------------------------------

export type Recurring = Schemas['RecurringOut']
export type RecurringIn = Schemas['RecurringIn']

export function useRecurring() {
  return useQuery({
    queryKey: financeKeys.recurring,
    queryFn: async () => unwrap(await api.GET('/finance/recurring')),
  })
}

export function useSaveRecurring() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    // Saving can generate today's occurrence, so refresh everything money-related.
    mutationFn: async ({ id, ...body }: RecurringIn & { id?: string }) =>
      unwrap(
        id
          ? await api.PUT('/finance/recurring/{recurring_id}', {
              params: { path: { recurring_id: id } },
              body,
            })
          : await api.POST('/finance/recurring', { body }),
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteRecurring() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE('/finance/recurring/{recurring_id}', {
        params: { path: { recurring_id: id } },
      })
      if (error !== undefined || !response.ok) throw new Error('Could not delete')
    },
    onSuccess: invalidate,
  })
}

// --- Checklist ---------------------------------------------------------------------------

export type ChecklistItem = Schemas['ChecklistItemOut']

export function useChecklist() {
  return useQuery({
    queryKey: financeKeys.checklist,
    queryFn: async () => unwrap(await api.GET('/finance/checklist')),
  })
}

// --- Name suggestions ----------------------------------------------------------------------

/**
 * Item names of one kind from the monthly budget(s) covering `today`, or, if none does,
 * from the most recent monthly budget. Used to suggest names for recurring rules so they
 * match existing items exactly.
 */
export function useItemNameSuggestions(kind: Kind, today: string): string[] {
  const budgets = useBudgets()
  const monthly = (budgets.data ?? []).filter((b) => b.period_type === 'month')
  const active = monthly.filter((b) => b.period_start <= today && today <= b.period_end)
  // The list is newest first, so monthly[0] is the most recent.
  const sources = active.length > 0 ? active : monthly.slice(0, 1)

  const details = useQueries({
    queries: sources.map((b) => ({
      queryKey: financeKeys.budget(b.id),
      queryFn: async () =>
        unwrap(await api.GET('/finance/budgets/{budget_id}', { params: { path: { budget_id: b.id } } })),
    })),
  })
  const names = details.flatMap((d) => (d.data?.items ?? []).filter((i) => i.kind === kind).map((i) => i.name))
  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
}
