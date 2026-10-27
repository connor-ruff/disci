import { ArrowLeft } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { errorMessage } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { Field, inputClasses } from '@/shared/ui/field'

import { type LogEntry, type Nutrient, type NutrientKey, usePreferences, useSaveQuickLog } from '../api'
import { NutrientFields, type NutrientValues, parseNutrients } from './FoodForm'

type QuickAddFormProps =
  | { entry: LogEntry; onDone: (saved: LogEntry) => void; date?: undefined; initialName?: undefined; onBack?: undefined }
  | { date: string; initialName?: string; onBack: () => void; onDone: () => void; entry?: undefined }

/** A one-off entry with its own name and nutrients, not saved to the repo. New, or editing `entry`. */
export function QuickAddForm(props: QuickAddFormProps) {
  const prefs = usePreferences()
  // The fields are built from the nutrient list, so wait for it (or an edit would save blanks).
  if (!prefs.data) return <p className="py-4 text-muted">Loading…</p>
  return <QuickAddFields {...props} nutrients={prefs.data.nutrients} tracked={prefs.data.tracked_nutrients} />
}

function QuickAddFields({
  entry,
  date,
  initialName = '',
  onBack,
  onDone,
  nutrients: all,
  tracked,
}: QuickAddFormProps & { nutrients: Nutrient[]; tracked: NutrientKey[] }) {
  const save = useSaveQuickLog()

  const [name, setName] = useState(entry?.food_name ?? initialName)
  const [values, setValues] = useState<NutrientValues>(() =>
    Object.fromEntries(
      all.map((n) => [n.key, entry?.nutrients[n.key] == null ? '' : String(Number(entry.nutrients[n.key]))]),
    ),
  )
  const [eatenOn, setEatenOn] = useState(entry?.eaten_on ?? date ?? '')
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [invalid, setInvalid] = useState<string | null>(null)

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const nutrients = parseNutrients(all, values)
    if (typeof nutrients === 'string') return setInvalid(nutrients)
    setInvalid(null)
    const body = { name: name.trim(), eaten_on: eatenOn, notes: notes.trim() || null, ...nutrients }
    save.mutate({ id: entry?.id, ...body }, { onSuccess: (saved) => onDone(saved) })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {onBack && (
        <div className="flex items-start gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to your foods" className="-ml-2">
            <ArrowLeft className="size-5" />
          </Button>
          <div className="min-w-0 pt-1.5">
            <p className="font-semibold">Quick add</p>
            <p className="text-sm text-muted">A rough estimate for this day only. It won't be saved to your repo.</p>
          </div>
        </div>
      )}

      <Field label="What was it?" htmlFor="quick-name">
        <input
          id="quick-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder="e.g. Burrito at the game"
          className={inputClasses}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-muted">Totals for what you ate.</p>
        <NutrientFields idPrefix="quick" nutrients={all} tracked={tracked} values={values} onChange={setValues} />
      </div>

      <Field label="Day" htmlFor="quick-date">
        <input
          id="quick-date"
          type="date"
          required
          value={eatenOn}
          onChange={(e) => setEatenOn(e.target.value)}
          className={inputClasses}
        />
      </Field>

      <Field label="Notes (optional)" htmlFor="quick-notes">
        <input
          id="quick-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          className={inputClasses}
        />
      </Field>

      {(invalid || save.isError) && <p className="text-sm text-red-700">{invalid ?? errorMessage(save.error)}</p>}

      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? 'Saving…' : entry ? 'Save' : 'Log it'}
      </Button>
    </form>
  )
}
