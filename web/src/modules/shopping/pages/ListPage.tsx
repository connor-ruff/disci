import { Check, ListPlus } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'
import { ReorderToggle } from '@/shared/ui/reorder-toggle'
import { SortableList } from '@/shared/ui/sortable'

import {
  type Item,
  useAddItem,
  useClearDone,
  useItems,
  useReorderItems,
  useReorderTypes,
  useSetDone,
  useTypes,
} from '../api'
import { AddFromCommonSheet } from '../components/AddFromCommonSheet'
import { EditTypesButton } from '../components/EditTypesButton'
import { type ItemSheetState, ItemSheet } from '../components/ItemSheet'
import { QuickAdd } from '../components/QuickAdd'
import { TypesSheet } from '../components/TypesSheet'
import { type Group, groupByType } from '../groups'

/** The list, one card per type. Check items off as you shop; clear them when you're done. */
export function ListPage() {
  const items = useItems()
  const types = useTypes()
  const [reordering, setReordering] = useState(false)
  const [sheet, setSheet] = useState<ItemSheetState>(null)
  const [editingTypes, setEditingTypes] = useState(false)
  const [addingCommon, setAddingCommon] = useState(false)

  const error = items.error ?? types.error
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Shopping list" />
        <div className="flex gap-2">
          {!reordering && <EditTypesButton onClick={() => setEditingTypes(true)} />}
          <ReorderToggle reordering={reordering} onChange={setReordering} />
        </div>
      </div>

      {(items.isPending || types.isPending) && <LoadingState />}
      {error && <ErrorState error={error} />}
      {items.data && types.data && (
        <Groups
          groups={groupByType(types.data, items.data)}
          items={items.data}
          reordering={reordering}
          onOpen={(item) => setSheet({ item })}
        />
      )}

      {!reordering && (
        <Button
          onClick={() => setAddingCommon(true)}
          className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 h-12 rounded-full px-4 shadow-lg"
        >
          <ListPlus className="size-5" />
          Common items
        </Button>
      )}
      <ItemSheet state={sheet} onClose={() => setSheet(null)} />
      <TypesSheet open={editingTypes} onOpenChange={setEditingTypes} />
      <AddFromCommonSheet open={addingCommon} onOpenChange={setAddingCommon} />
    </>
  )
}

function Groups({
  groups,
  items,
  reordering,
  onOpen,
}: {
  groups: Group<Item>[]
  items: Item[]
  reordering: boolean
  onOpen: (item: Item) => void
}) {
  const reorderTypes = useReorderTypes()
  const reorderItems = useReorderItems()

  /** Item order is global: send every item, with this group's in their new order. */
  function onReorderItems(group: Group<Item>, ordered: Item[]) {
    const ids = items.flatMap((i) => (i.shopping_type_id === group.typeId ? (ordered.shift() ?? []) : [i]))
    reorderItems.mutate(ids.map((i) => i.id))
  }

  if (!reordering) {
    return (
      <div className="mb-20 flex flex-col gap-4">
        {groups.map((g) => (
          <TypeCard key={g.typeId ?? ''} group={g} onOpen={onOpen} />
        ))}
      </div>
    )
  }

  const typed = groups.filter((g) => g.typeId !== null)
  const uncategorized = groups.find((g) => g.typeId === null)
  const renderGroup = (group: Group<Item>, handle?: ReactNode) => (
    <Card className="mb-3 p-0">
      <div className="flex items-center gap-1 py-1 pr-4 pl-1">
        {handle ?? <span className="w-3" />}
        <h2 className="flex-1 truncate font-semibold">{group.name}</h2>
      </div>
      <SortableList
        label={`${group.name} items`}
        items={group.rows}
        getId={(i) => i.id}
        onReorder={(ordered) => onReorderItems(group, [...ordered])}
        renderItem={(item, itemHandle) => (
          <div className="flex items-center gap-1 border-t border-border py-1 pr-4 pl-4">
            {itemHandle}
            <span className={cn('flex-1 truncate', item.done && 'text-muted line-through')}>{item.name}</span>
          </div>
        )}
      />
    </Card>
  )

  return (
    <div className="mb-6">
      {typed.length > 1 && <p className="mb-3 text-sm text-muted">Drag types by their grip, or items within them.</p>}
      <SortableList
        label="Shopping types"
        items={typed}
        getId={(g) => g.typeId ?? ''}
        onReorder={(ordered) => reorderTypes.mutate(ordered.map((g) => g.typeId!))}
        renderItem={(group, handle) => renderGroup(group, handle)}
      />
      {uncategorized && renderGroup(uncategorized)}
    </div>
  )
}

/** One type's items: still to buy first, then crossed off. Add and clear at the bottom. */
function TypeCard({ group, onOpen }: { group: Group<Item>; onOpen: (item: Item) => void }) {
  const add = useAddItem()
  const clear = useClearDone()
  const open = group.rows.filter((i) => !i.done)
  const done = group.rows.filter((i) => i.done)

  return (
    <Card className="p-0">
      <h2 className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-2 text-lg font-semibold">
        <span className="truncate">{group.name}</span>
        {group.rows.length > 0 && (
          <span className="shrink-0 text-sm font-normal text-muted">
            {open.length === 0 ? 'All done' : `${open.length} to buy`}
          </span>
        )}
      </h2>
      {group.rows.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {[...open, ...done].map((item) => (
            <li key={item.id}>
              <ItemRow item={item} onOpen={() => onOpen(item)} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 border-t border-border p-3">
        <QuickAdd
          placeholder={group.typeId ? `Add to ${group.name}` : 'Add an item'}
          pending={add.isPending}
          error={add.error}
          onAdd={(name, reset) => add.mutate({ name, shopping_type_id: group.typeId, save_as_common: false }, { onSuccess: reset })}
        />
        {done.length > 0 && (
          <Button variant="ghost" disabled={clear.isPending} onClick={() => clear.mutate(group.typeId)} className="text-primary">
            Clear {done.length} crossed off
          </Button>
        )}
      </div>
    </Card>
  )
}

function ItemRow({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const setDone = useSetDone()
  return (
    <div className="flex items-center gap-1 pl-2">
      <button
        type="button"
        onClick={() => setDone.mutate({ id: item.id, done: !item.done })}
        aria-label={item.done ? `Put ${item.name} back on the list` : `Cross off ${item.name}`}
        aria-pressed={item.done}
        className="flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span
          className={cn(
            'flex size-7 items-center justify-center rounded-full border-2',
            item.done ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
          )}
        >
          {item.done && <Check className="size-4" />}
        </span>
      </button>
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 py-2.5 pr-4 text-left transition hover:bg-highlight"
      >
        <span className={cn('block truncate font-medium', item.done && 'text-muted line-through')}>{item.name}</span>
        {item.notes && <span className="block truncate text-sm text-muted">{item.notes}</span>}
      </button>
    </div>
  )
}
