import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/shared/lib/cn'

type SortableListProps<T> = {
  items: T[]
  getId: (item: T) => string
  /** Called with the items in their new order after a drop. */
  onReorder: (items: T[]) => void
  renderItem: (item: T, handle: ReactNode) => ReactNode
  label: string
}

/**
 * A vertical list you reorder by dragging each row's grip handle. Works with touch
 * (press and hold briefly), mouse, and keyboard (focus a handle, Space, arrows, Space).
 */
export function SortableList<T>({ items, getId, onReorder, renderItem, label }: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const ids = items.map(getId)
    onReorder(arrayMove(items, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map(getId)} strategy={verticalListSortingStrategy}>
        <ul aria-label={label}>
          {items.map((item) => (
            <SortableRow key={getId(item)} id={getId(item)}>
              {(handle) => renderItem(item, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id })

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label="Drag to reorder"
      className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted hover:bg-highlight active:cursor-grabbing"
    >
      <GripVertical className="size-5" />
    </button>
  )

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('relative bg-surface', isDragging && 'z-10 rounded-lg shadow-lg')}
    >
      {children(handle)}
    </li>
  )
}
