import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { errorMessage } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { inputClasses } from '@/shared/ui/field'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'
import { SortableList } from '@/shared/ui/sortable'

import {
  type Category,
  type Kind,
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useRenameCategory,
  useReorderCategories,
} from '../api'
import { ReorderToggle } from '../components/ReorderToggle'

export function CategoriesPage() {
  const categories = useCategories()
  const [reordering, setReordering] = useState(false)

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title="Categories"
          description="Optional buckets for budget items. Items without one show as Uncategorized."
        />
        <ReorderToggle reordering={reordering} onChange={setReordering} />
      </div>
      {categories.isPending && <LoadingState />}
      {categories.isError && <ErrorState error={categories.error} />}
      {categories.data && (
        <div className="flex flex-col gap-4">
          {(['expense', 'income'] as const).map((kind) => (
            <CategoryList
              key={kind}
              kind={kind}
              title={kind === 'expense' ? 'Expenses' : 'Income'}
              categories={categories.data.filter((c) => c.kind === kind)}
              reordering={reordering}
            />
          ))}
        </div>
      )}
    </>
  )
}

function CategoryList({
  kind,
  title,
  categories,
  reordering,
}: {
  kind: Kind
  title: string
  categories: Category[]
  reordering: boolean
}) {
  const create = useCreateCategory()
  const reorder = useReorderCategories()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  function onAdd(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    create.mutate(
      { kind, name: name.trim(), description: description.trim() || null },
      {
        onSuccess: () => {
          setName('')
          setDescription('')
        },
      },
    )
  }

  return (
    <Card className="p-0">
      <h2 className="px-4 pt-4 pb-2 text-sm font-semibold tracking-wide text-muted uppercase">
        {title}
      </h2>
      {categories.length === 0 && <p className="px-4 pb-3 text-muted">No categories yet.</p>}

      {reordering ? (
        <SortableList
          label={`${title} categories`}
          items={categories}
          getId={(c) => c.id}
          onReorder={(ordered) => reorder.mutate({ kind, ids: ordered.map((c) => c.id) })}
          renderItem={(category, handle) => (
            <div className="flex items-center gap-1 border-t border-border py-1 pr-4 pl-1">
              {handle}
              <span className="flex-1">{category.name}</span>
            </div>
          )}
        />
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {categories.map((category) => (
            <CategoryRow key={category.id} category={category} />
          ))}
        </ul>
      )}

      {!reordering && (
        <form onSubmit={onAdd} className="flex flex-col gap-2 border-t border-border p-3">
          <div className="flex gap-2">
            <input
              aria-label={`New ${title.toLowerCase()} category`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="Add a category"
              className={inputClasses}
            />
            <Button
              type="submit"
              size="icon"
              aria-label="Add category"
              disabled={create.isPending || !name.trim()}
            >
              <Plus className="size-5" />
            </Button>
          </div>
          {name.trim() && (
            <input
              aria-label="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              placeholder="Description (optional)"
              className={inputClasses}
            />
          )}
          {create.isError && <p className="text-sm text-red-700">{errorMessage(create.error)}</p>}
        </form>
      )}
    </Card>
  )
}

function CategoryRow({ category }: { category: Category }) {
  const update = useRenameCategory()
  const remove = useDeleteCategory()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [description, setDescription] = useState(category.description ?? '')

  function onSave(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    update.mutate(
      { id: category.id, name: name.trim(), description: description.trim() || null },
      { onSuccess: () => setEditing(false) },
    )
  }

  function onDelete() {
    if (window.confirm(`Delete "${category.name}"? Items in it become Uncategorized.`)) {
      remove.mutate(category.id)
    }
  }

  if (editing) {
    return (
      <li className="px-3 py-2">
        <form onSubmit={onSave} className="flex flex-col gap-2">
          <input
            aria-label="Category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className={inputClasses}
          />
          <input
            aria-label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            placeholder="Description (optional)"
            className={inputClasses}
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={update.isPending} className="flex-1">
              Save
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setName(category.name)
                setDescription(category.description ?? '')
                setEditing(false)
              }}
            >
              <X className="size-5" />
              Cancel
            </Button>
          </div>
        </form>
        {update.isError && <p className="pt-1 text-sm text-red-700">{errorMessage(update.error)}</p>}
      </li>
    )
  }

  return (
    <li className="flex items-center gap-1 py-1 pr-2 pl-4">
      <div className="min-w-0 flex-1">
        <p>{category.name}</p>
        {category.description && <p className="truncate text-sm text-muted">{category.description}</p>}
      </div>
      <Button variant="ghost" size="icon" aria-label={`Edit ${category.name}`} onClick={() => setEditing(true)}>
        <Pencil className="size-4 text-muted" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Delete ${category.name}`}
        disabled={remove.isPending}
        onClick={onDelete}
      >
        <Trash2 className="size-4 text-muted" />
      </Button>
    </li>
  )
}
