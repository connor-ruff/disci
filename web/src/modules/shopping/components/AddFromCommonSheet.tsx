import { Link } from '@tanstack/react-router'

import { Sheet } from '@/shared/ui/sheet'

import { useCommon, useTypes } from '../api'
import { groupByType } from '../groups'
import { CommonRow } from './CommonRow'

/** Tap common items to put them on the list. Stays open, so several go on in a row. */
export function AddFromCommonSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const common = useCommon()
  const types = useTypes()
  const groups = groupByType(types.data ?? [], common.data ?? []).filter((g) => g.rows.length > 0)

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add from common items">
      {common.isPending && <p className="py-6 text-center text-muted">Loading…</p>}
      {common.data?.length === 0 && (
        <p className="py-4 text-muted">
          No common items yet. Add the things you buy often on the{' '}
          <Link to="/shopping/common" className="text-primary underline" onClick={() => onOpenChange(false)}>
            Common items
          </Link>{' '}
          page.
        </p>
      )}
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.typeId ?? ''}>
            <h3 className="pb-1 text-xs font-semibold tracking-wide text-muted uppercase">{g.name}</h3>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {g.rows.map((c) => (
                <li key={c.id}>
                  <CommonRow common={c} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
