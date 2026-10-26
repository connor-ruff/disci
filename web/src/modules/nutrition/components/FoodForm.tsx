import { ChevronDown } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { errorMessage } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { Field, inputClasses } from '@/shared/ui/field'

import { type Food, type Nutrient, type NutrientKey, usePreferences, useSaveFood } from '../api'
import { UNIT_SUGGESTIONS } from '../format'

/** A typed number: digits with optional decimals (commas allowed). Blank → null (unknown). */
function parseAmount(input: string): string | null | undefined {
  const cleaned = input.replace(/[,\s]/g, '')
  if (cleaned === '') return null
  return /^\d+(\.\d+)?$/.test(cleaned) ? cleaned : undefined
}

type FoodFormProps = {
  food?: Food
  initialName?: string
  onSaved: (food: Food) => void
  onCancel?: () => void
}

/** Creates a food, or edits `food`. Tracked nutrients show first; the rest are tucked away. */
export function FoodForm(props: FoodFormProps) {
  const prefs = usePreferences()
  // The fields are built from the nutrient list, so wait for it (or an edit would save blanks).
  if (!prefs.data) return <p className="py-4 text-muted">Loading…</p>
  return <FoodFields {...props} nutrients={prefs.data.nutrients} tracked={prefs.data.tracked_nutrients} />
}

function FoodFields({
  food,
  initialName = '',
  onSaved,
  onCancel,
  nutrients: all,
  tracked: trackedKeys,
}: FoodFormProps & { nutrients: Nutrient[]; tracked: NutrientKey[] }) {
  const save = useSaveFood()

  const [name, setName] = useState(food?.name ?? initialName)
  const [description, setDescription] = useState(food?.description ?? '')
  const [quantity, setQuantity] = useState(food ? String(Number(food.standard_quantity)) : '100')
  const [unit, setUnit] = useState(food?.standard_unit ?? 'g')
  const [values, setValues] = useState<Partial<Record<NutrientKey, string>>>(() =>
    Object.fromEntries(
      all.map((n) => [n.key, food?.[n.key] == null ? '' : String(Number(food[n.key]))]),
    ),
  )
  const [invalid, setInvalid] = useState<string | null>(null)

  const tracked = all.filter((n) => trackedKeys.includes(n.key))
  const others = all.filter((n) => !trackedKeys.includes(n.key))
  // Open the extra nutrients when the food already has values there.
  const [showOthers, setShowOthers] = useState(others.some((n) => food?.[n.key] != null))

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const standard = parseAmount(quantity)
    if (!standard || Number(standard) === 0) return setInvalid('Enter a standard quantity like 100 or 0.5')
    const nutrients: Partial<Record<NutrientKey, string | null>> = {}
    for (const n of all) {
      const value = parseAmount(values[n.key] ?? '')
      if (value === undefined) return setInvalid(`${n.label}: enter a number, or leave it blank if unknown`)
      nutrients[n.key] = value
    }
    setInvalid(null)
    save.mutate(
      {
        id: food?.id,
        name: name.trim(),
        description: description.trim() || null,
        standard_quantity: standard,
        standard_unit: unit.trim(),
        ...nutrients,
      },
      { onSuccess: onSaved },
    )
  }

  const nutrientField = (n: Nutrient) => (
    <Field key={n.key} label={`${n.label} (${n.unit})`} htmlFor={`food-${n.key}`}>
      <input
        id={`food-${n.key}`}
        inputMode="decimal"
        value={values[n.key] ?? ''}
        onChange={(e) => setValues((v) => ({ ...v, [n.key]: e.target.value }))}
        placeholder="Unknown"
        className={inputClasses}
      />
    </Field>
  )

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Name" htmlFor="food-name">
        <input
          id="food-name"
          required
          autoFocus={!food}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder="e.g. Broccoli"
          className={inputClasses}
        />
      </Field>

      <Field label="Description (optional)" htmlFor="food-description">
        <input
          id="food-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          placeholder="e.g. Steamed, from frozen"
          className={inputClasses}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Standard quantity" htmlFor="food-quantity">
            <input
              id="food-quantity"
              required
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="Unit" htmlFor="food-unit">
            <input
              id="food-unit"
              required
              list="food-unit-options"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              maxLength={30}
              className={inputClasses}
            />
            <datalist id="food-unit-options">
              {UNIT_SUGGESTIONS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </Field>
        </div>
        <p className="text-sm text-muted">
          Nutrients below are for this amount. You log multiples of it: 1.2 × 100 g = 120 g.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg bg-background p-3">
        <p className="text-sm text-muted">Leave a nutrient blank if you don't know it. It won't count as 0.</p>
        <div className="grid grid-cols-2 gap-3">{tracked.map(nutrientField)}</div>
        {others.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowOthers((s) => !s)}
              aria-expanded={showOthers}
              className="flex items-center gap-1 self-start text-sm font-medium text-primary"
            >
              <ChevronDown className={showOthers ? 'size-4 rotate-180 transition' : 'size-4 transition'} />
              {showOthers ? 'Hide' : 'Show'} nutrients you don't track ({others.length})
            </button>
            {showOthers && <div className="grid grid-cols-2 gap-3">{others.map(nutrientField)}</div>}
          </>
        )}
      </div>

      {(invalid || save.isError) && (
        <p className="text-sm text-red-700">{invalid ?? errorMessage(save.error)}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending} className="flex-1">
          {save.isPending ? 'Saving…' : food ? 'Save' : 'Add food'}
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
