import { ArrowLeft, ChevronRight, Plus, Search } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { errorMessage } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { Field, inputClasses } from '@/shared/ui/field'
import { Sheet } from '@/shared/ui/sheet'

import {
  type Food,
  type LogEntry,
  useDeleteLog,
  useFoods,
  useLogFood,
  useTrackedNutrients,
  useUpdateLog,
} from '../api'
import { formatNutrient, formatQuantity } from '../format'
import { FoodForm } from './FoodForm'

type LogSheetProps = {
  /** The day being logged to (YYYY-MM-DD). */
  date: string
  /** Edit this entry; otherwise log a new one. */
  entry?: LogEntry
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LogSheet({ date, entry, open, onOpenChange }: LogSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={entry ? entry.food_name : 'Log food'}>
      {/* Keyed so it starts fresh each time it opens. */}
      {entry ? (
        <EntryForm key={entry.id} entry={entry} onDone={() => onOpenChange(false)} />
      ) : (
        <NewEntry key={String(open)} date={date} onDone={() => onOpenChange(false)} />
      )}
    </Sheet>
  )
}

/** Pick a food (or add one), then how much. */
function NewEntry({ date, onDone }: { date: string; onDone: () => void }) {
  const [food, setFood] = useState<Food | null>(null)
  const [creating, setCreating] = useState<string | null>(null)

  if (creating !== null) {
    return <FoodForm initialName={creating} onSaved={(f) => (setCreating(null), setFood(f))} onCancel={() => setCreating(null)} />
  }
  if (food) return <EntryForm food={food} date={date} onBack={() => setFood(null)} onDone={onDone} />
  return <FoodPicker onPick={setFood} onCreate={setCreating} />
}

function FoodPicker({ onPick, onCreate }: { onPick: (food: Food) => void; onCreate: (name: string) => void }) {
  const foods = useFoods()
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const all = foods.data ?? []
  const matches = q ? all.filter((f) => `${f.name} ${f.description ?? ''}`.toLowerCase().includes(q)) : all
  // Without a search, recently logged foods come first.
  const recent = q
    ? []
    : all
        .filter((f) => f.last_logged_on)
        .sort((a, b) => (b.last_logged_on ?? '').localeCompare(a.last_logged_on ?? ''))
        .slice(0, 5)
  const exact = all.some((f) => f.name.toLowerCase() === q)

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your foods"
          aria-label="Search your foods"
          className={inputClasses + ' pl-9'}
        />
      </div>

      <Button variant="outline" onClick={() => onCreate(query.trim())} className="justify-start">
        <Plus className="size-4" />
        {q && !exact ? `Add "${query.trim()}" as a new food` : 'Add a new food'}
      </Button>

      {foods.isPending && <p className="text-muted">Loading…</p>}
      {foods.data && all.length === 0 && (
        <p className="text-muted">Your food repo is empty. Add a food to log it.</p>
      )}
      {foods.data && all.length > 0 && matches.length === 0 && <p className="text-muted">No foods match.</p>}

      {recent.length > 0 && <FoodList title="Recent" foods={recent} onPick={onPick} />}
      {matches.length > 0 && <FoodList title={q ? 'Matches' : 'All foods'} foods={matches} onPick={onPick} />}
    </div>
  )
}

function FoodList({ title, foods, onPick }: { title: string; foods: Food[]; onPick: (food: Food) => void }) {
  return (
    <div>
      <h3 className="pb-1 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {foods.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => onPick(f)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-highlight"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{f.name}</span>
                <span className="block truncate text-sm text-muted">
                  per {formatQuantity(f.standard_quantity, f.standard_unit)}
                  {f.description && ` · ${f.description}`}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

type EntryFormProps =
  | { entry: LogEntry; onDone: () => void; food?: undefined; date?: undefined; onBack?: undefined }
  | { food: Food; date: string; onBack: () => void; onDone: () => void; entry?: undefined }

/** How much (and when): for a new entry of `food`, or editing `entry`. */
function EntryForm({ entry, food, date, onBack, onDone }: EntryFormProps) {
  const tracked = useTrackedNutrients()
  const logFood = useLogFood()
  const update = useUpdateLog()
  const remove = useDeleteLog()
  const mutation = entry ? update : logFood

  const [servings, setServings] = useState(entry ? String(Number(entry.servings)) : '1')
  const [eatenOn, setEatenOn] = useState(entry?.eaten_on ?? date ?? '')
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [invalid, setInvalid] = useState<string | null>(null)

  const standardQuantity = entry?.standard_quantity ?? food!.standard_quantity
  const unit = entry?.standard_unit ?? food!.standard_unit
  const multiple = Number(servings)
  const valid = /^(\d+(\.\d{1,6})?|\.\d{1,6})$/.test(servings.trim()) && multiple > 0

  /** Per-standard values: a food's own, or an entry's divided back out. */
  function valueFor(key: (typeof tracked)[number]['key']): number | null {
    if (food) return food[key] == null ? null : Number(food[key])
    const v = entry!.nutrients[key]
    return v == null ? null : Number(v) / Number(entry!.servings)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return setInvalid('Enter how many, like 1, 1.5 or 0.25 (up to 6 decimal places)')
    setInvalid(null)
    const body = { servings: servings.trim(), eaten_on: eatenOn, notes: notes.trim() || null }
    if (entry) update.mutate({ id: entry.id, ...body }, { onSuccess: onDone })
    else logFood.mutate({ food_item_id: food!.id, ...body }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {food && (
        <div className="flex items-start gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Pick a different food" className="-ml-2">
            <ArrowLeft className="size-5" />
          </Button>
          <div className="min-w-0 pt-1.5">
            <p className="truncate font-semibold">{food.name}</p>
            <p className="text-sm text-muted">
              Standard: {formatQuantity(food.standard_quantity, food.standard_unit)}
              {food.description && ` · ${food.description}`}
            </p>
          </div>
        </div>
      )}
      {entry?.food_deleted && (
        <p className="rounded-lg bg-background p-3 text-sm text-muted">
          This food was removed from your repo. You can still change or delete this entry.
        </p>
      )}

      <Field
        label={`How many × ${formatQuantity(standardQuantity, unit)}`}
        htmlFor="log-servings"
        hint={valid ? `= ${formatQuantity(multiple * Number(standardQuantity), unit)}` : undefined}
      >
        <input
          id="log-servings"
          inputMode="decimal"
          autoFocus
          required
          value={servings}
          onChange={(e) => setServings(e.target.value)}
          className={inputClasses + ' text-lg font-semibold'}
        />
      </Field>

      {tracked.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-background p-3 text-sm">
          {tracked.map((n) => {
            const per = valueFor(n.key)
            return (
              <div key={n.key} className="flex items-baseline justify-between gap-2">
                <dt className="text-muted">{n.label}</dt>
                <dd className="font-medium">
                  {per === null ? (
                    <span className="text-amber-700">unknown</span>
                  ) : valid ? (
                    formatNutrient(per * multiple, n)
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      )}

      <Field label="Day" htmlFor="log-date">
        <input
          id="log-date"
          type="date"
          required
          value={eatenOn}
          onChange={(e) => setEatenOn(e.target.value)}
          className={inputClasses}
        />
      </Field>

      <Field label="Notes (optional)" htmlFor="log-notes">
        <input
          id="log-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          className={inputClasses}
        />
      </Field>

      {(invalid || mutation.isError) && (
        <p className="text-sm text-red-700">{invalid ?? errorMessage(mutation.error)}</p>
      )}

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Saving…' : entry ? 'Save' : 'Log it'}
      </Button>
      {entry && (
        <Button
          variant="ghost"
          className="text-red-700"
          disabled={remove.isPending}
          onClick={() => window.confirm(`Remove ${entry.food_name} from this day?`) && remove.mutate(entry.id, { onSuccess: onDone })}
        >
          Delete entry
        </Button>
      )}
    </form>
  )
}
