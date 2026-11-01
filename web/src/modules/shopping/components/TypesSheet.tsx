import { Pencil, Trash2, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { errorMessage } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { inputClasses } from '@/shared/ui/field'
import { Sheet } from '@/shared/ui/sheet'

import { type ShoppingType, useCreateType, useDeleteType, useRenameType, useTypes } from '../api'
import { QuickAdd } from './QuickAdd'

/** Add, rename and delete shopping types. Reordering is the list page's Reorder mode. */
export function TypesSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const types = useTypes()
  const create = useCreateType()

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Shopping types">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          What you shop by: a kind (Groceries, Clothing) or a store (Kroger, Trader Joe's). Deleting one moves its items
          to Uncategorized.
        </p>
        {types.data && types.data.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {types.data.map((t) => (
              <TypeRow key={t.id} type={t} />
            ))}
          </ul>
        )}
        <QuickAdd
          placeholder="Add a type"
          pending={create.isPending}
          error={create.error}
          onAdd={(name, done) => create.mutate(name, { onSuccess: done })}
        />
      </div>
    </Sheet>
  )
}

function TypeRow({ type }: { type: ShoppingType }) {
  const rename = useRenameType()
  const remove = useDeleteType()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(type.name)

  function onSave(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    rename.mutate({ id: type.id, name: name.trim() }, { onSuccess: () => setEditing(false) })
  }

  if (editing) {
    return (
      <li className="p-2">
        <form onSubmit={onSave} className="flex gap-2">
          <input
            aria-label="Type name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className={inputClasses}
          />
          <Button type="submit" disabled={rename.isPending}>
            Save
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cancel"
            onClick={() => {
              setName(type.name)
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
    <li className="flex items-center gap-1 py-1 pr-1 pl-3">
      <span className="min-w-0 flex-1 truncate">{type.name}</span>
      <Button variant="ghost" size="icon" aria-label={`Rename ${type.name}`} onClick={() => setEditing(true)}>
        <Pencil className="size-4 text-muted" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Delete ${type.name}`}
        disabled={remove.isPending}
        onClick={() =>
          window.confirm(`Delete "${type.name}"? Its items become Uncategorized.`) && remove.mutate(type.id)
        }
      >
        <Trash2 className="size-4 text-muted" />
      </Button>
    </li>
  )
}
