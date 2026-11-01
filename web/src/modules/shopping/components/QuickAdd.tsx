import { Plus } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { errorMessage } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { inputClasses } from '@/shared/ui/field'

/**
 * A one-line "add" box at the bottom of a list. The field keeps focus after each add
 * (Return on the keyboard), so several items go in one after another.
 */
export function QuickAdd({
  placeholder,
  onAdd,
  pending,
  error,
}: {
  placeholder: string
  onAdd: (name: string, done: () => void) => void
  pending: boolean
  error: unknown
}) {
  const [name, setName] = useState('')

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    onAdd(name.trim(), () => setName(''))
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          aria-label={placeholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          placeholder={placeholder}
          enterKeyHint="done"
          className={inputClasses}
        />
        <Button type="submit" size="icon" aria-label={placeholder} disabled={pending || !name.trim()}>
          <Plus className="size-5" />
        </Button>
      </div>
      {error != null && <p className="text-sm text-red-700">{errorMessage(error)}</p>}
    </form>
  )
}
