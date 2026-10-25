import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { errorMessage } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { inputClasses } from '@/shared/ui/field'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'

import {
  type Category,
  type Kind,
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useRenameCategory,
} from '../api'

export function CategoriesPage() {
  const categories = useCategories()

  return (
    <>
      <PageHeader
        title="Categories"
        description="Optional buckets for budget items. Items without one show as Uncategorized."
      />
      {categories.isPending && <LoadingState />}
      {categories.isError && <ErrorState error={categories.error} />}
      {categories.data && (
        <div className="flex flex-col gap-4">
          <CategoryList
            kind="expense"
            title="Expenses"
            categories={categories.data.filter((c) => c.kind === 'expense')}
          />
          <CategoryList
            kind="income"
            title="Income"
            categories={categories.data.filter((c) => c.kind === 'income')}
          />
        </div>
      )}
    </>
  )
}

function CategoryList({ kind, title, categories }: { kind: Kind; title: string; categories: Category[] }) {
  const create = useCreateCategory()
  const [name, setName] = useState('')

  function onAdd(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    create.mutate({ kind, name: name.trim() }, { onSuccess: () => setName('') })
  }

  return (
    <Card className="p-0">
      <h2 className="px-4 pt-4 pb-2 text-sm font-semibold tracking-wide text-muted uppercase">
        {title}
      </h2>
      <ul className="divide-y divide-border">
        {categories.length === 0 && <li className="px-4 py-3 text-muted">No categories yet.</li>}
        {categories.map((category) => (
          <CategoryRow key={category.id} category={category} />
        ))}
      </ul>
      <form onSubmit={onAdd} className="flex gap-2 border-t border-border p-3">
        <input
          aria-label={`New ${title.toLowerCase()} category`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder="Add a category"
          className={inputClasses}
        />
        <Button type="submit" size="icon" aria-label="Add category" disabled={create.isPending || !name.trim()}>
          <Plus className="size-5" />
        </Button>
      </form>
      {create.isError && <p className="px-4 pb-3 text-sm text-red-700">{errorMessage(create.error)}</p>}
    </Card>
  )
}

function CategoryRow({ category }: { category: Category }) {
  const rename = useRenameCategory()
  const remove = useDeleteCategory()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)

  function onSave(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    rename.mutate({ id: category.id, name: name.trim() }, { onSuccess: () => setEditing(false) })
  }

  function onDelete() {
    if (window.confirm(`Delete "${category.name}"? Items in it become Uncategorized.`)) {
      remove.mutate(category.id)
    }
  }

  if (editing) {
    return (
      <li className="px-3 py-2">
        <form onSubmit={onSave} className="flex gap-2">
          <input
            aria-label="Category name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className={inputClasses}
          />
          <Button type="submit" size="icon" aria-label="Save" disabled={rename.isPending}>
            <Check className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cancel"
            onClick={() => {
              setName(category.name)
              setEditing(false)
            }}
          >
            <X className="size-5" />
          </Button>
        </form>
        {rename.isError && <p className="pt-1 text-sm text-red-700">{errorMessage(rename.error)}</p>}
      </li>
    )
  }

  return (
    <li className="flex items-center gap-1 py-1 pr-2 pl-4">
      <span className="flex-1">{category.name}</span>
      <Button variant="ghost" size="icon" aria-label={`Rename ${category.name}`} onClick={() => setEditing(true)}>
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
