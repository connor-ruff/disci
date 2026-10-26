import { Target } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { errorMessage } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Field, inputClasses } from '@/shared/ui/field'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'
import { Segmented } from '@/shared/ui/segmented'
import { Sheet } from '@/shared/ui/sheet'

import {
  type Goal,
  type GoalKind,
  type Nutrient,
  type NutrientKey,
  useDeleteGoal,
  useGoals,
  usePreferences,
  useSaveGoal,
} from '../api'
import { formatNutrient } from '../format'

const KINDS: Record<GoalKind, { title: string; verb: string; hint: string }> = {
  target: { title: 'Targets', verb: 'Reach at least', hint: 'Amounts to reach each day, like 150 g of protein.' },
  limit: { title: 'Limits', verb: 'Stay under', hint: 'Amounts to stay under each day, like 1,750 mg of sodium.' },
}

export function GoalsPage() {
  const goals = useGoals()
  const prefs = usePreferences()
  const [sheet, setSheet] = useState<{ goal?: Goal; kind?: GoalKind } | null>(null)

  const nutrients = prefs.data?.nutrients ?? []
  const tracked = prefs.data?.tracked_nutrients ?? []

  return (
    <>
      <PageHeader
        title="Macro goals"
        description="Daily targets and limits. Changes apply from today; past days keep the goals they had."
      />

      {(goals.isPending || prefs.isPending) && <LoadingState />}
      {goals.isError && <ErrorState error={goals.error} />}

      {goals.data && prefs.data && (
        <div className="flex flex-col gap-4">
          {(['target', 'limit'] as const).map((kind) => {
            const rows = goals.data.filter((g) => g.kind === kind)
            return (
              <Card key={kind} className="p-0">
                <div className="px-4 pt-4 pb-2">
                  <h2 className="text-lg font-semibold">{KINDS[kind].title}</h2>
                  <p className="text-sm text-muted">{KINDS[kind].hint}</p>
                </div>
                {rows.length > 0 && (
                  <ul className="divide-y divide-border border-t border-border">
                    {rows.map((g) => {
                      const n = nutrients.find((x) => x.key === g.nutrient)!
                      return (
                        <li key={g.id}>
                          <button
                            type="button"
                            onClick={() => setSheet({ goal: g })}
                            className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left transition hover:bg-highlight"
                          >
                            <span className="min-w-0">
                              <span className="font-medium">{n.label}</span>
                              {!tracked.includes(g.nutrient) && (
                                <span className="ml-2 rounded-full bg-background px-2 py-0.5 text-xs text-muted">
                                  not tracked
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 text-sm text-muted">
                              {KINDS[kind].verb.toLowerCase()}{' '}
                              <span className="font-semibold text-foreground">{formatNutrient(g.amount, n)}</span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <div className="border-t border-border p-2">
                  <Button variant="ghost" onClick={() => setSheet({ kind })} className="w-full text-primary">
                    <Target className="size-5" />
                    Add a {kind}
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Sheet
        open={sheet !== null}
        onOpenChange={(open) => !open && setSheet(null)}
        title={sheet?.goal ? 'Edit goal' : `New ${sheet?.kind ?? 'goal'}`}
      >
        {sheet && prefs.data && (
          <GoalForm
            key={sheet.goal?.id ?? sheet.kind}
            goal={sheet.goal}
            defaultKind={sheet.kind ?? 'target'}
            nutrients={nutrients}
            tracked={tracked}
            taken={goals.data ?? []}
            onDone={() => setSheet(null)}
          />
        )}
      </Sheet>
    </>
  )
}

function GoalForm({
  goal,
  defaultKind,
  nutrients,
  tracked,
  taken,
  onDone,
}: {
  goal?: Goal
  defaultKind: GoalKind
  nutrients: Nutrient[]
  tracked: NutrientKey[]
  taken: Goal[]
  onDone: () => void
}) {
  const save = useSaveGoal()
  const remove = useDeleteGoal()
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? defaultKind)
  // Nutrients that don't have a goal of this kind yet (tracked ones first).
  const available = [...nutrients]
    .sort((a, b) => Number(!tracked.includes(a.key)) - Number(!tracked.includes(b.key)))
    .filter((n) => goal || !taken.some((g) => g.kind === kind && g.nutrient === n.key))
  const [nutrient, setNutrient] = useState<NutrientKey | ''>(goal?.nutrient ?? available[0]?.key ?? '')
  const [amount, setAmount] = useState(goal ? String(Number(goal.amount)) : '')
  const [invalid, setInvalid] = useState<string | null>(null)

  const selected = nutrients.find((n) => n.key === (goal?.nutrient ?? nutrient))

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const value = amount.replace(/[,\s]/g, '')
    if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) === 0) return setInvalid('Enter an amount like 150')
    if (!goal && !nutrient) return setInvalid('Pick a nutrient')
    setInvalid(null)
    save.mutate(goal ? { id: goal.id, amount: value } : { nutrient: nutrient as NutrientKey, kind, amount: value }, {
      onSuccess: onDone,
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {goal ? (
        <p className="text-muted">
          {KINDS[goal.kind].verb} this much {selected?.label.toLowerCase()} a day.
        </p>
      ) : (
        <>
          <Segmented
            label="Goal type"
            value={kind}
            onChange={(k) => {
              setKind(k)
              setNutrient('')
            }}
            options={[
              { value: 'target', label: 'Target (reach at least)' },
              { value: 'limit', label: 'Limit (stay under)' },
            ]}
            size="sm"
          />
          <Field label="Nutrient" htmlFor="goal-nutrient">
            <select
              id="goal-nutrient"
              required
              value={nutrient}
              onChange={(e) => setNutrient(e.target.value as NutrientKey)}
              className={inputClasses}
            >
              <option value="" disabled>
                Pick a nutrient
              </option>
              {available.map((n) => (
                <option key={n.key} value={n.key}>
                  {n.label}
                  {tracked.includes(n.key) ? '' : ' (not tracked)'}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}

      <Field label={`Amount per day${selected ? ` (${selected.unit})` : ''}`} htmlFor="goal-amount">
        <input
          id="goal-amount"
          inputMode="decimal"
          autoFocus
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputClasses + ' text-lg font-semibold'}
        />
      </Field>

      {(invalid || save.isError) && <p className="text-sm text-red-700">{invalid ?? errorMessage(save.error)}</p>}

      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? 'Saving…' : goal ? 'Save' : 'Add goal'}
      </Button>
      {goal && (
        <Button
          variant="ghost"
          className="text-red-700"
          disabled={remove.isPending}
          onClick={() =>
            window.confirm('Remove this goal from today on? Past days keep it.') &&
            remove.mutate(goal.id, { onSuccess: onDone })
          }
        >
          Remove goal
        </Button>
      )}
    </form>
  )
}
