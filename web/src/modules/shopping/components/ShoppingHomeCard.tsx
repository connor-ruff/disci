import { Link } from '@tanstack/react-router'
import { ShoppingCart } from 'lucide-react'

import { ModuleCard } from '@/shared/ui/module-card'

import { useItems, useTypes } from '../api'
import { groupByType } from '../groups'

/** Home card: how much is left to buy, per type. Opens the list. */
export function ShoppingHomeCard() {
  const items = useItems()
  const types = useTypes()
  const open = (items.data ?? []).filter((i) => !i.done)
  const groups = groupByType(types.data ?? [], open).filter((g) => g.rows.length > 0)

  const subtitle = !items.data ? 'Loading…' : open.length === 0 ? 'Nothing on the list' : `${open.length} to buy`

  return (
    <Link to="/shopping/list" className="block rounded-2xl">
      <ModuleCard icon={ShoppingCart} title="Shopping list" subtitle={subtitle}>
        {groups.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {groups.slice(0, 4).map((g) => (
              <li key={g.typeId ?? ''} className="flex items-baseline justify-between gap-3">
                <span className="truncate font-medium">{g.name}</span>
                <span className="shrink-0 text-muted">{g.rows.length}</span>
              </li>
            ))}
            {groups.length > 4 && <li className="text-muted">and {groups.length - 4} more</li>}
          </ul>
        )}
      </ModuleCard>
    </Link>
  )
}
