import { Apple, Pencil, Plus, Search } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { formatLongDate } from '@/shared/lib/dates'

import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { inputClasses } from '@/shared/ui/field'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'
import { Sheet } from '@/shared/ui/sheet'

import { type Food, useDeleteFood, useFoods, usePreferences, useTrackedNutrients } from '../api'
import { FoodForm } from '../components/FoodForm'
import { formatNutrient, formatQuantity } from '../format'

export function FoodsPage() {
  const foods = useFoods()
  const tracked = useTrackedNutrients()
  const [query, setQuery] = useState('')
  const [sheet, setSheet] = useState<{ foodId?: string } | null>(null)

  const q = query.trim().toLowerCase()
  const shown = (foods.data ?? []).filter((f) => `${f.name} ${f.description ?? ''}`.toLowerCase().includes(q))
  // Looked up by id so the sheet shows fresh values after an edit.
  const openFood = foods.data?.find((f) => f.id === sheet?.foodId)

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Food repo" description="Foods you've saved, so their nutrition facts are a tap away." />
        <Button onClick={() => setSheet({})}>
          <Plus className="size-5" />
          New
        </Button>
      </div>

      {foods.isPending && <LoadingState />}
      {foods.isError && <ErrorState error={foods.error} />}
      {foods.data?.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Apple className="size-10 text-accent" />
          <h2 className="text-lg font-semibold">No foods yet</h2>
          <p className="max-w-sm text-muted">
            Add a food once with its nutrition facts for a standard amount (like 100 g), then log multiples of it.
          </p>
          <Button onClick={() => setSheet({})}>Add a food</Button>
        </Card>
      )}

      {foods.data && foods.data.length > 0 && (
        <>
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${foods.data.length} foods`}
              aria-label="Search foods"
              className={inputClasses + ' pl-9'}
            />
          </div>
          {shown.length === 0 && <p className="text-muted">No foods match.</p>}
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {shown.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setSheet({ foodId: f.id })}
                    className="flex w-full flex-col gap-0.5 px-4 py-3 text-left transition hover:bg-highlight"
                  >
                    <span className="flex w-full items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate font-medium">{f.name}</span>
                      <span className="shrink-0 text-sm text-muted">
                        per {formatQuantity(f.standard_quantity, f.standard_unit)}
                      </span>
                    </span>
                    {f.description && <span className="truncate text-sm text-muted">{f.description}</span>}
                    <span className="flex flex-wrap gap-x-3 text-xs text-muted">
                      {tracked.map((n) =>
                        f[n.key] == null ? (
                          <span key={n.key} className="text-amber-700">
                            {n.label.toLowerCase()} unknown
                          </span>
                        ) : (
                          <span key={n.key}>
                            {formatNutrient(f[n.key]!, n)} {n.key === 'calories' ? '' : n.label.toLowerCase()}
                          </span>
                        ),
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <FoodSheet food={openFood} open={sheet !== null} onOpenChange={(open) => !open && setSheet(null)} />
    </>
  )
}

/** A food's facts with Edit and Delete; or the form for a new food. */
function FoodSheet({
  food,
  open,
  onOpenChange,
}: {
  food?: Food
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [editing, setEditing] = useState(false)

  function onOpenChangeAndReset(next: boolean) {
    if (!next) setEditing(false)
    onOpenChange(next)
  }

  const title = food ? (editing ? 'Edit food' : food.name) : 'New food'
  return (
    <Sheet open={open} onOpenChange={onOpenChangeAndReset} title={title}>
      {!food ? (
        <FoodForm key={String(open)} onSaved={() => onOpenChangeAndReset(false)} />
      ) : editing ? (
        <FoodForm key={food.id} food={food} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
      ) : (
        <FoodFacts food={food} onEdit={() => setEditing(true)} onDeleted={() => onOpenChangeAndReset(false)} />
      )}
    </Sheet>
  )
}

function FoodFacts({ food, onEdit, onDeleted }: { food: Food; onEdit: () => void; onDeleted: () => void }) {
  const prefs = usePreferences()
  const remove = useDeleteFood()
  const tracked = prefs.data?.tracked_nutrients ?? []
  // Tracked nutrients always; others only when the food has a value for them.
  const shown = (prefs.data?.nutrients ?? []).filter((n) => tracked.includes(n.key) || food[n.key] != null)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-sm text-muted">
        Nutrition per {formatQuantity(food.standard_quantity, food.standard_unit)}
      </p>

      <dl className="divide-y divide-border rounded-lg border border-border">
        {food.description && <Fact label="Description">{food.description}</Fact>}
        {shown.map((n) => (
          <Fact key={n.key} label={n.label}>
            {food[n.key] == null ? <span className="text-amber-700">unknown</span> : formatNutrient(food[n.key]!, n)}
          </Fact>
        ))}
        <Fact label="Last logged">
          {food.last_logged_on ? formatLongDate(food.last_logged_on) : <span className="text-muted">Never</span>}
        </Fact>
      </dl>

      <Button onClick={onEdit}>
        <Pencil className="size-4" />
        Edit
      </Button>
      <Button
        variant="ghost"
        className="text-red-700"
        disabled={remove.isPending}
        onClick={() =>
          window.confirm(`Delete "${food.name}"? Days you logged it on keep it.`) &&
          remove.mutate(food.id, { onSuccess: onDeleted })
        }
      >
        Delete food
      </Button>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <dt className="w-28 shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm font-medium">{children}</dd>
    </div>
  )
}
