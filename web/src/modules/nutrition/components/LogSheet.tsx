import { ArrowLeft, CalendarDays, ChevronRight, Pencil, Plus, Search, Zap } from 'lucide-react'
import { type FormEvent, type ReactNode, useState } from 'react'

import { errorMessage } from '@/shared/api/client'
import { formatLongDate } from '@/shared/lib/dates'
import { Button } from '@/shared/ui/button'
import { Field, inputClasses } from '@/shared/ui/field'
import { Sheet } from '@/shared/ui/sheet'

import {
  type Food,
  type LogEntry,
  type NutrientKey,
  useDeleteLog,
  useFoods,
  useLogFood,
  useTrackedNutrients,
  useUpdateLog,
} from '../api'
import { describeEntry, formatNutrient, formatQuantity } from '../format'
import { FoodForm } from './FoodForm'
import { QuickAddForm } from './QuickAddForm'

type LogSheetProps = {
  /** The day being logged to (YYYY-MM-DD). */
  date: string
  /** Edit this entry; otherwise log a new one. */
  entry?: LogEntry
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Logging a new entry, or one entry's facts with Edit and Delete. */
export function LogSheet({ date, entry: opened, open, onOpenChange }: LogSheetProps) {
  const [editing, setEditing] = useState(false)
  // The entry as last saved here, so the view shows the edit right away.
  const [saved, setSaved] = useState<LogEntry | null>(null)
  const entry = saved?.id === opened?.id ? saved! : opened

  function onOpenChangeAndReset(next: boolean) {
    if (!next) {
      setEditing(false)
      setSaved(null)
    }
    onOpenChange(next)
  }

  function onSaved(next: LogEntry) {
    // Moved to another day: it's no longer on this sheet.
    if (next.eaten_on !== entry!.eaten_on) return onOpenChangeAndReset(false)
    setSaved(next)
    setEditing(false)
  }

  const title = entry ? (editing ? 'Edit entry' : entry.food_name) : 'Log food'
  return (
    <Sheet open={open} onOpenChange={onOpenChangeAndReset} title={title}>
      {/* Keyed so it starts fresh each time it opens. */}
      {!entry ? (
        <NewEntry key={String(open)} date={date} onDone={() => onOpenChangeAndReset(false)} />
      ) : editing ? (
        <>
          {entry.food_item_id ? (
            <EntryForm key={entry.id} entry={entry} onDone={onSaved} />
          ) : (
            <QuickAddForm key={entry.id} entry={entry} onDone={onSaved} />
          )}
          <Button variant="ghost" onClick={() => setEditing(false)} className="mt-2 w-full">
            Cancel
          </Button>
        </>
      ) : (
        <EntryFacts entry={entry} onEdit={() => setEditing(true)} onDeleted={() => onOpenChangeAndReset(false)} />
      )}
    </Sheet>
  )
}

function EntryFacts({ entry, onEdit, onDeleted }: { entry: LogEntry; onEdit: () => void; onDeleted: () => void }) {
  const tracked = useTrackedNutrients()
  const remove = useDeleteLog()
  const [headline, ...rest] = tracked
  const value = (key: NutrientKey) => entry.nutrients[key]

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        {headline && (
          <p className="text-3xl font-semibold">
            {value(headline.key) == null ? (
              <span className="text-amber-700">? {headline.unit}</span>
            ) : (
              formatNutrient(value(headline.key)!, headline)
            )}
          </p>
        )}
        <p className="mt-1 text-sm text-muted">
          {entry.food_item_id ? describeEntry(entry) : 'Quick add · not saved to your repo'}
        </p>
      </div>

      {entry.food_deleted && (
        <p className="rounded-lg bg-background p-3 text-sm text-muted">
          This food was removed from your repo. You can still change or delete this entry.
        </p>
      )}

      <dl className="divide-y divide-border rounded-lg border border-border">
        <Fact icon={<CalendarDays className="size-4" />} label="Day">
          {formatLongDate(entry.eaten_on)}
        </Fact>
        {rest.map((n) => (
          <Fact key={n.key} label={n.label}>
            {value(n.key) == null ? (
              <span className="text-amber-700">unknown</span>
            ) : (
              formatNutrient(value(n.key)!, n)
            )}
          </Fact>
        ))}
      </dl>

      {entry.notes && (
        <div>
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Notes</p>
          <p className="mt-1 whitespace-pre-wrap">{entry.notes}</p>
        </div>
      )}

      <Button onClick={onEdit}>
        <Pencil className="size-4" />
        Edit
      </Button>
      <Button
        variant="ghost"
        className="text-red-700"
        disabled={remove.isPending}
        onClick={() =>
          window.confirm(`Remove ${entry.food_name} from this day?`) && remove.mutate(entry.id, { onSuccess: onDeleted })
        }
      >
        Delete entry
      </Button>
    </div>
  )
}

function Fact({ icon, label, children }: { icon?: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <span className="mt-0.5 w-4 text-muted">{icon}</span>
      <dt className="w-28 shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm font-medium">{children}</dd>
    </div>
  )
}

/** Pick a food (or add one), then how much; or a quick add with its own nutrients. */
function NewEntry({ date, onDone }: { date: string; onDone: () => void }) {
  const [food, setFood] = useState<Food | null>(null)
  const [creating, setCreating] = useState<string | null>(null)
  const [quickAdding, setQuickAdding] = useState<string | null>(null)

  if (quickAdding !== null) {
    return <QuickAddForm date={date} initialName={quickAdding} onBack={() => setQuickAdding(null)} onDone={onDone} />
  }
  if (creating !== null) {
    return <FoodForm initialName={creating} onSaved={(f) => (setCreating(null), setFood(f))} onCancel={() => setCreating(null)} />
  }
  if (food) return <EntryForm food={food} date={date} onBack={() => setFood(null)} onDone={onDone} />
  return <FoodPicker onPick={setFood} onCreate={setCreating} onQuickAdd={setQuickAdding} />
}

function FoodPicker({
  onPick,
  onCreate,
  onQuickAdd,
}: {
  onPick: (food: Food) => void
  onCreate: (name: string) => void
  onQuickAdd: (name: string) => void
}) {
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
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your foods"
          aria-label="Search your foods"
          className={inputClasses + ' pl-9'}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => onCreate(query.trim())} className="min-w-0 justify-start">
          <Plus className="size-4" />
          <span className="truncate">{q && !exact ? `Save "${query.trim()}"` : 'New food'}</span>
        </Button>
        <Button variant="outline" onClick={() => onQuickAdd(query.trim())} className="justify-start">
          <Zap className="size-4" />
          Quick add
        </Button>
      </div>

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
  | { entry: LogEntry; onDone: (saved: LogEntry) => void; food?: undefined; date?: undefined; onBack?: undefined }
  | { food: Food; date: string; onBack: () => void; onDone: () => void; entry?: undefined }

/** How much (and when): for a new entry of `food`, or editing `entry`. */
function EntryForm({ entry, food, date, onBack, onDone }: EntryFormProps) {
  const tracked = useTrackedNutrients()
  const logFood = useLogFood()
  const update = useUpdateLog()
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
      <Field
        label={`How many × ${formatQuantity(standardQuantity, unit)}`}
        htmlFor="log-servings"
        hint={valid ? `= ${formatQuantity(multiple * Number(standardQuantity), unit)}` : undefined}
      >
        <input
          id="log-servings"
          inputMode="decimal"
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
    </form>
  )
}
