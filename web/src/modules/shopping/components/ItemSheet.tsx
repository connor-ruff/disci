import { BookmarkPlus } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { ApiError, errorMessage } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { Field, inputClasses } from '@/shared/ui/field'
import { Sheet } from '@/shared/ui/sheet'

import {
  type CommonItem,
  type Item,
  type ItemFields,
  useDeleteCommon,
  useDeleteItem,
  useSaveCommon,
  useTypes,
  useUpdateItem,
} from '../api'

function pick({ name, shopping_type_id, notes }: Item | CommonItem): ItemFields {
  return { name, shopping_type_id, notes }
}

/** What the sheet edits: an item on the list, or a common item. */
export type ItemSheetState = { item: Item } | { common: CommonItem } | null

/** Edit an item's name, type and note; remove it, or (list items) save it as a common item. */
export function ItemSheet({ state, onClose }: { state: ItemSheetState; onClose: () => void }) {
  return (
    <Sheet
      open={state !== null}
      onOpenChange={(open) => !open && onClose()}
      title={state && 'common' in state ? 'Common item' : 'Item'}
    >
      {state &&
        ('item' in state ? (
          <ListItemForm key={state.item.id} item={state.item} onDone={onClose} />
        ) : (
          <CommonForm key={state.common.id} common={state.common} onDone={onClose} />
        ))}
    </Sheet>
  )
}

function ListItemForm({ item, onDone }: { item: Item; onDone: () => void }) {
  const update = useUpdateItem()
  const remove = useDeleteItem()
  const saveCommon = useSaveCommon()
  const [fields, setFields] = useState(() => pick(item))
  // A 409 just means it's already there, which is what the user wanted.
  const alreadyCommon = saveCommon.error instanceof ApiError && saveCommon.error.status === 409

  return (
    <div className="flex flex-col gap-4">
      <ItemFieldsForm
        fields={fields}
        onChange={setFields}
        pending={update.isPending}
        error={update.error}
        onSubmit={() => update.mutate({ id: item.id, body: fields }, { onSuccess: onDone })}
      />
      <Button
        variant="outline"
        disabled={saveCommon.isPending || saveCommon.isSuccess || alreadyCommon}
        onClick={() => saveCommon.mutate({ body: fields })}
      >
        <BookmarkPlus className="size-4" />
        {saveCommon.isSuccess ? 'Saved to common items' : alreadyCommon ? 'Already a common item' : 'Save to common items'}
      </Button>
      {saveCommon.isError && !alreadyCommon && <p className="text-sm text-red-700">{errorMessage(saveCommon.error)}</p>}
      <Button
        variant="ghost"
        className="text-red-700"
        disabled={remove.isPending}
        onClick={() => remove.mutate(item.id, { onSuccess: onDone })}
      >
        Remove from list
      </Button>
    </div>
  )
}

function CommonForm({ common, onDone }: { common: CommonItem; onDone: () => void }) {
  const save = useSaveCommon()
  const remove = useDeleteCommon()
  const [fields, setFields] = useState(() => pick(common))

  return (
    <div className="flex flex-col gap-4">
      <ItemFieldsForm
        fields={fields}
        onChange={setFields}
        pending={save.isPending}
        error={save.error}
        onSubmit={() => save.mutate({ id: common.id, body: fields }, { onSuccess: onDone })}
      />
      <Button
        variant="ghost"
        className="text-red-700"
        disabled={remove.isPending}
        onClick={() =>
          window.confirm(`Delete "${common.name}" from your common items? Your list isn't affected.`) &&
          remove.mutate(common.id, { onSuccess: onDone })
        }
      >
        Delete common item
      </Button>
    </div>
  )
}

function ItemFieldsForm({
  fields,
  onChange,
  onSubmit,
  pending,
  error,
}: {
  fields: ItemFields
  onChange: (fields: ItemFields) => void
  onSubmit: () => void
  pending: boolean
  error: unknown
}) {
  const types = useTypes()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (fields.name.trim()) onSubmit()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Name" htmlFor="shopping-name">
        <input
          id="shopping-name"
          value={fields.name}
          onChange={(e) => onChange({ ...fields, name: e.target.value })}
          maxLength={200}
          required
          className={inputClasses}
        />
      </Field>
      <Field label="Type" htmlFor="shopping-type">
        <select
          id="shopping-type"
          value={fields.shopping_type_id ?? ''}
          onChange={(e) => onChange({ ...fields, shopping_type_id: e.target.value || null })}
          className={inputClasses}
        >
          {types.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          <option value="">Uncategorized</option>
        </select>
      </Field>
      <Field label="Note (optional)" htmlFor="shopping-notes" hint="Like 2 lbs, the blue one, size 10">
        <input
          id="shopping-notes"
          value={fields.notes ?? ''}
          onChange={(e) => onChange({ ...fields, notes: e.target.value || null })}
          maxLength={300}
          className={inputClasses}
        />
      </Field>
      {error != null && <p className="text-sm text-red-700">{errorMessage(error)}</p>}
      <Button type="submit" disabled={pending || !fields.name.trim()}>
        Save
      </Button>
    </form>
  )
}
