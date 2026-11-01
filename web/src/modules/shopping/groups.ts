import type { ShoppingType } from './api'

export type Group<T> = { typeId: string | null; name: string; rows: T[] }

/**
 * Rows by type, in the user's type order, with Uncategorized last. Every type gets a group
 * (so you can add to an empty one); Uncategorized only when it has rows or there are no types.
 */
export function groupByType<T extends { shopping_type_id: string | null }>(types: ShoppingType[], rows: T[]): Group<T>[] {
  const groups: Group<T>[] = types.map((t) => ({ typeId: t.id, name: t.name, rows: [] }))
  const uncategorized: Group<T> = { typeId: null, name: 'Uncategorized', rows: [] }
  for (const row of rows) {
    ;(groups.find((g) => g.typeId === row.shopping_type_id) ?? uncategorized).rows.push(row)
  }
  return uncategorized.rows.length > 0 || types.length === 0 ? [...groups, uncategorized] : groups
}
