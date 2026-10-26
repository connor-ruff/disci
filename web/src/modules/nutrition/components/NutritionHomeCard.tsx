import { Link } from '@tanstack/react-router'
import { CircleAlert, CircleCheck, Salad } from 'lucide-react'

import { cn } from '@/shared/lib/cn'
import { Meter, ModuleCard } from '@/shared/ui/module-card'

import { type Goal, type Nutrient, type NutrientTotal, useDay, useGoals, useTrackedNutrients } from '../api'
import { formatNutrient } from '../format'
import { useToday } from './DaySheet'

/** Home card: today's calories and progress toward each daily goal. Opens today's sheet. */
export function NutritionHomeCard() {
  const today = useToday()
  const day = useDay(today)
  const goals = useGoals()
  const tracked = useTrackedNutrients()

  const ready = day.data && goals.data && tracked.length > 0
  const totals = new Map(day.data?.totals.map((t) => [t.nutrient, t]))
  const calories = tracked.find((n) => n.key === 'calories')
  // Untracked nutrients aren't shown anywhere, goals included.
  const shown = (goals.data ?? []).flatMap((g) => {
    const nutrient = tracked.find((n) => n.key === g.nutrient)
    return nutrient ? [{ goal: g, nutrient }] : []
  })
  const entries = day.data?.entries.length ?? 0

  return (
    <Link to="/nutrition/daily" className="block rounded-2xl">
      <ModuleCard
        icon={Salad}
        title="Nutrition"
        subtitle={!day.data ? 'Loading…' : entries === 0 ? 'Nothing logged yet today' : `Today · ${entries} ${entries === 1 ? 'food' : 'foods'}`}
      >
        {ready && (
          <div className="flex flex-col gap-3">
            {calories && (
              <p className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold">
                  {formatNutrient(totals.get('calories')?.amount ?? 0, calories)}
                </span>
                <span className="text-sm text-muted">today</span>
                {(totals.get('calories')?.missing_foods.length ?? 0) > 0 && <Incomplete />}
              </p>
            )}
            {shown.length > 0 ? (
              <ul className="flex flex-col gap-2.5">
                {shown.map(({ goal, nutrient }) => (
                  <li key={goal.id}>
                    <GoalMeter goal={goal} nutrient={nutrient} total={totals.get(goal.nutrient)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No daily goals yet. Add targets or limits on the Goals tab.</p>
            )}
          </div>
        )}
      </ModuleCard>
    </Link>
  )
}

/** One goal: "Protein · target" with how far along today is, as a bar and a percentage. */
function GoalMeter({ goal, nutrient, total }: { goal: Goal; nutrient: Nutrient; total?: NutrientTotal }) {
  const amount = Number(total?.amount ?? 0)
  const ratio = amount / Number(goal.amount)
  const reached = goal.kind === 'target' && ratio >= 1
  const over = goal.kind === 'limit' && ratio > 1

  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-baseline justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium">{nutrient.label}</span>
          <span className="text-xs text-muted">{goal.kind}</span>
          {(total?.missing_foods.length ?? 0) > 0 && <Incomplete />}
        </span>
        <span className={cn('shrink-0 text-muted', over && 'text-amber-700')}>
          {formatNutrient(amount, nutrient)} / {formatNutrient(goal.amount, nutrient)}
          <span className={cn('ml-1.5 font-semibold text-foreground', over && 'text-amber-700')}>
            {Math.round(ratio * 100)}%
          </span>
          {reached && <CircleCheck className="ml-1 inline size-3.5 text-accent" aria-label="reached" />}
        </span>
      </p>
      <Meter ratio={ratio} warn={over} />
    </div>
  )
}

/** Some foods logged today have no value for this nutrient. */
function Incomplete() {
  return <CircleAlert className="size-3.5 shrink-0 text-amber-600" aria-label="some foods are missing values" />
}
