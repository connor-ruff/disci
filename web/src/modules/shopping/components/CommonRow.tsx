import { Check, Plus } from 'lucide-react'

import { cn } from '@/shared/lib/cn'

import { type CommonItem, useAddCommonToList } from '../api'

/**
 * A common item with its "add to list" button, or "On list" once it's there (not crossed
 * off). Tapping the name calls onOpen when given.
 */
export function CommonRow({ common, onOpen }: { common: CommonItem; onOpen?: () => void }) {
  const add = useAddCommonToList()
  const onList = common.on_list || add.isPending

  const label = (
    <span className="min-w-0 flex-1">
      <span className="block truncate font-medium">{common.name}</span>
      {common.notes && <span className="block truncate text-sm text-muted">{common.notes}</span>}
    </span>
  )

  return (
    <div className="flex items-center gap-1 pr-1">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 py-2.5 pl-4 text-left transition hover:bg-highlight"
        >
          {label}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 py-2.5 pl-4">{label}</div>
      )}
      <button
        type="button"
        onClick={() => add.mutate(common.id)}
        disabled={onList}
        aria-label={onList ? `${common.name} is on your list` : `Add ${common.name} to your list`}
        className={cn(
          'flex h-11 shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-medium transition',
          onList ? 'text-muted' : 'text-primary hover:bg-highlight',
        )}
      >
        {onList ? <Check className="size-4" /> : <Plus className="size-4" />}
        {onList ? 'On list' : 'Add'}
      </button>
    </div>
  )
}
