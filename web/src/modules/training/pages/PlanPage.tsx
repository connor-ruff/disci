import { Link } from '@tanstack/react-router'
import { Flag } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { useMe } from '@/shared/api/hooks'
import { errorMessage } from '@/shared/api/client'
import { cn } from '@/shared/lib/cn'
import { addDays, formatShortDate } from '@/shared/lib/dates'
import { Button, buttonClasses } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Field, inputClasses } from '@/shared/ui/field'
import { ErrorState, LoadingState } from '@/shared/ui/page'
import { Sheet } from '@/shared/ui/sheet'

import {
  type Grid,
  type Plan,
  type PlanDay,
  type PlanDetail,
  type PlanFields,
  useDeletePlan,
  useEditWeek,
  usePlan,
  usePlans,
  useReplaceDays,
  useSetPlanActive,
  useUpdatePlan,
} from '../api'
import { GridPaste } from '../components/GridPaste'
import { PlanDetailsFields, PlanRulesFields } from '../components/PlanFields'
import { formatMiles, weekStart } from '../format'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function fieldsOf(p: Plan): PlanFields {
  const { name, race_name, race_on, starts_on, count_walk_miles, cross_train_at_pct } = p
  return { name, race_name, race_on, starts_on, count_walk_miles, cross_train_at_pct }
}

/** The active plan (details, rules, miles week by week) and past plans. */
export function PlanPage() {
  const plans = usePlans()
  const active = plans.data?.find((p) => p.is_active)
  const others = plans.data?.filter((p) => !p.is_active) ?? []
  const detail = usePlan(active?.id)

  return (
    <div className="mb-10 flex flex-col gap-4">
      {plans.isPending && <LoadingState />}
      {plans.isError && <ErrorState error={plans.error} />}
      {plans.data && !active && (
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <Flag className="size-10 text-accent" />
          <h1 className="text-lg font-semibold">No active plan</h1>
          <p className="max-w-sm text-muted">Start a plan, or make a past one active again.</p>
          <Link to="/training/plan/new" className={buttonClasses()}>
            Start a plan
          </Link>
        </Card>
      )}
      {detail.isError && <ErrorState error={detail.error} />}
      {detail.data && <ActivePlan plan={detail.data} />}
      {plans.data && (others.length > 0 || active) && <PastPlans plans={others} />}
    </div>
  )
}

function ActivePlan({ plan }: { plan: PlanDetail }) {
  const [editing, setEditing] = useState(false)
  const [week, setWeek] = useState<string | null>(null)
  const [replacing, setReplacing] = useState(false)

  return (
    <>
      <Card className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-semibold">{plan.name}</h1>
          <span className="flex-1" />
          <Button variant="ghost" className="h-9 px-2 text-accent" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
        <p className="text-sm text-muted">
          {plan.race_name && (
            <>
              Race: {plan.race_name}
              {plan.race_on && ` · ${formatShortDate(plan.race_on)}, ${plan.race_on.slice(0, 4)}`}
              <br />
            </>
          )}
          Starts {formatShortDate(plan.starts_on)} · {formatMiles(plan.total_miles)} mi planned over {plan.day_count} days
        </p>
        <span className="self-start rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-800">Active plan</span>
      </Card>

      <RulesCard plan={plan} />

      <WeeksGrid plan={plan} onOpen={setWeek} onReplace={() => setReplacing(true)} />

      <Sheet open={editing} onOpenChange={setEditing} title="Plan details">
        {editing && <DetailsForm plan={plan} onDone={() => setEditing(false)} />}
      </Sheet>
      <Sheet open={week !== null} onOpenChange={(open) => !open && setWeek(null)} title={week ? `Week of ${formatShortDate(week)}` : ''}>
        {week && <WeekForm key={week} plan={plan} startsOn={week} onDone={() => setWeek(null)} />}
      </Sheet>
      <Sheet open={replacing} onOpenChange={setReplacing} title="Replace miles from a sheet">
        {replacing && <ReplaceForm plan={plan} onDone={() => setReplacing(false)} />}
      </Sheet>
    </>
  )
}

function DetailsForm({ plan, onDone }: { plan: PlanDetail; onDone: () => void }) {
  const update = useUpdatePlan()
  const [fields, setFields] = useState(() => fieldsOf(plan))
  function submit(event: FormEvent) {
    event.preventDefault()
    update.mutate({ id: plan.id, body: fields }, { onSuccess: onDone })
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <PlanDetailsFields value={fields} onChange={setFields} />
      {update.isError && <p className="text-sm text-red-700">{errorMessage(update.error)}</p>}
      <Button type="submit" disabled={update.isPending || !fields.name.trim()}>
        Save
      </Button>
    </form>
  )
}

function RulesCard({ plan }: { plan: PlanDetail }) {
  const update = useUpdatePlan()
  const [fields, setFields] = useState(() => fieldsOf(plan))
  const dirty =
    fields.count_walk_miles !== plan.count_walk_miles || fields.cross_train_at_pct !== plan.cross_train_at_pct
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-semibold">Rules</h2>
      <PlanRulesFields value={fields} onChange={setFields} />
      {update.isError && <p className="text-sm text-red-700">{errorMessage(update.error)}</p>}
      {dirty && (
        <Button disabled={update.isPending} onClick={() => update.mutate({ id: plan.id, body: { ...fieldsOf(plan), ...pickRules(fields) } })}>
          Save rules
        </Button>
      )}
    </Card>
  )
}

function pickRules(f: PlanFields) {
  return { count_walk_miles: f.count_walk_miles, cross_train_at_pct: f.cross_train_at_pct }
}

/** The plan's weeks from its start to its end, a row each: miles per day and the total. */
function WeeksGrid({ plan, onOpen, onReplace }: { plan: PlanDetail; onOpen: (week: string) => void; onReplace: () => void }) {
  const me = useMe()
  const weekStartsOn = me.data?.week_starts_on ?? 1
  const days = new Map(plan.days.map((d) => [d.day_on, d]))
  const targets = new Map(plan.weeks.map((w) => [w.week_starts_on, w.target_miles]))
  const lastDay = [plan.ends_on, plan.days[plan.days.length - 1]?.day_on, plan.starts_on].filter(Boolean).sort().pop()!
  const weeks: string[] = []
  for (let w = weekStart(plan.starts_on, weekStartsOn); w <= lastDay; w = addDays(w, 7)) weeks.push(w)
  const letters = Array.from({ length: 7 }, (_, i) => DAY_NAMES[(weekStartsOn - 1 + i) % 7][0])
  const cols = 'grid grid-cols-[1.75rem_repeat(7,minmax(0,1fr))_2.75rem] items-center gap-0.5'

  return (
    <Card className="flex flex-col gap-2 px-2">
      <div className="flex items-baseline gap-2 px-2">
        <h2 className="font-semibold">Planned miles</h2>
        <span className="flex-1" />
        <Button variant="ghost" className="h-9 px-2 text-sm text-accent" onClick={onReplace}>
          Paste from a sheet
        </Button>
      </div>
      <div className={cn(cols, 'text-center text-[11px] font-semibold text-muted')}>
        <span>Wk</span>
        {letters.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
        <span className="pr-1 text-right">Total</span>
      </div>
      <div className="flex flex-col">
        {weeks.map((w, i) => {
          const weekDays = Array.from({ length: 7 }, (_, j) => days.get(addDays(w, j)))
          const sum = weekDays.reduce((t, d) => t + Number(d?.planned_miles ?? 0), 0)
          const target = targets.get(w)
          return (
            <button
              key={w}
              type="button"
              onClick={() => onOpen(w)}
              aria-label={`Week ${i + 1}, ${formatShortDate(w)}: ${formatMiles(target ?? sum.toFixed(2))} miles. Edit.`}
              className={cn(cols, 'rounded-lg py-1 text-center text-sm hover:bg-highlight')}
            >
              <span className="text-[11px] text-muted">{i + 1}</span>
              {weekDays.map((d, j) => (
                <span key={j} className={d ? 'font-medium' : 'text-muted/50'}>
                  {d ? formatMiles(d.planned_miles) : '·'}
                </span>
              ))}
              <span className={cn('pr-1 text-right font-bold', target && 'text-violet-800')}>{formatMiles(target ?? sum.toFixed(2))}</span>
            </button>
          )
        })}
      </div>
      <p className="px-2 text-xs text-muted">
        Tap a week to edit its days. A blank day is a rest day. <span className="font-semibold text-violet-800">Purple</span> totals are a
        weekly target you set yourself, instead of the sum of the days.
      </p>
    </Card>
  )
}

type DayRow = { miles: string; notes: string }

function WeekForm({ plan, startsOn, onDone }: { plan: PlanDetail; startsOn: string; onDone: () => void }) {
  const me = useMe()
  const edit = useEditWeek()
  const dates = Array.from({ length: 7 }, (_, i) => addDays(startsOn, i))
  const existing = new Map(plan.days.map((d) => [d.day_on, d]))
  const [rows, setRows] = useState<DayRow[]>(() =>
    dates.map((d) => {
      const day = existing.get(d)
      return { miles: day ? formatMiles(day.planned_miles) : '', notes: day?.notes ?? '' }
    }),
  )
  const setTarget = plan.weeks.find((w) => w.week_starts_on === startsOn)?.target_miles
  const [target, setTargetText] = useState(setTarget ? formatMiles(setTarget) : '')
  const sum = rows.reduce((t, r) => t + (Number(r.miles) || 0), 0)
  const weekStartsOn = me.data?.week_starts_on ?? 1

  function submit(event: FormEvent) {
    event.preventDefault()
    const days: PlanDay[] = rows.flatMap((r, i) =>
      Number(r.miles) > 0 ? [{ day_on: dates[i], planned_miles: r.miles.trim(), notes: r.notes.trim() || null }] : [],
    )
    edit.mutate({ id: plan.id, startsOn, days, target: target.trim() || null }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid grid-cols-[2.75rem_4.5rem_1fr] gap-2 text-xs font-semibold text-muted">
        <span>Day</span>
        <span>Miles</span>
        <span>Notes</span>
      </div>
      {rows.map((r, i) => {
        const name = DAY_NAMES[(weekStartsOn - 1 + i) % 7]
        return (
          <div key={i} className="grid grid-cols-[2.75rem_4.5rem_1fr] items-center gap-2">
            <span className="text-sm font-medium">{name}</span>
            <input
              aria-label={`${name} miles`}
              value={r.miles}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, miles: e.target.value } : x)))}
              inputMode="decimal"
              placeholder="rest"
              className={inputClasses}
            />
            <input
              aria-label={`${name} notes`}
              value={r.notes}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)))}
              maxLength={200}
              placeholder="optional"
              className={inputClasses}
            />
          </div>
        )
      })}
      <Field
        label="Weekly target (optional)"
        htmlFor="plan-week-target"
        hint={`Leave blank to use the sum of the days (${formatMiles(sum.toFixed(2))} mi).`}
      >
        <input
          id="plan-week-target"
          value={target}
          onChange={(e) => setTargetText(e.target.value)}
          inputMode="decimal"
          placeholder={formatMiles(sum.toFixed(2))}
          className={cn(inputClasses, 'w-32')}
        />
      </Field>
      {edit.isError && <p className="text-sm text-red-700">{errorMessage(edit.error)}</p>}
      <Button type="submit" disabled={edit.isPending}>
        Save week
      </Button>
    </form>
  )
}

function ReplaceForm({ plan, onDone }: { plan: PlanDetail; onDone: () => void }) {
  const replace = useReplaceDays()
  const [grid, setGrid] = useState<Grid | null>(null)
  return (
    <div className="flex flex-col gap-4">
      <GridPaste onGrid={setGrid} />
      <p className="text-sm text-muted">This replaces every planned day in {plan.name}. Weekly targets you set stay.</p>
      {replace.isError && <p className="text-sm text-red-700">{errorMessage(replace.error)}</p>}
      <Button
        disabled={replace.isPending || !grid || grid.days.length === 0}
        onClick={() => grid && replace.mutate({ id: plan.id, days: grid.days }, { onSuccess: onDone })}
      >
        Replace planned miles
      </Button>
    </div>
  )
}

function PastPlans({ plans }: { plans: Plan[] }) {
  const setActive = useSetPlanActive()
  const remove = useDeletePlan()
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="font-semibold">Past plans</h2>
      {plans.length === 0 && <p className="text-sm text-muted">None yet.</p>}
      {plans.map((p) => (
        <div key={p.id} className="flex items-center gap-2 border-t border-border pt-2 first-of-type:border-t-0">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{p.name}</p>
            <p className="text-sm text-muted">
              {formatShortDate(p.starts_on)}
              {p.ends_on && ` – ${formatShortDate(p.ends_on)}, ${p.ends_on.slice(0, 4)}`} · {formatMiles(p.total_miles)} mi
            </p>
          </div>
          <Button variant="outline" className="h-9 px-3 text-sm" disabled={setActive.isPending} onClick={() => setActive.mutate({ id: p.id, active: true })}>
            Make active
          </Button>
          <Button
            variant="ghost"
            className="h-9 px-2 text-sm text-red-700"
            disabled={remove.isPending}
            onClick={() => window.confirm(`Delete "${p.name}"? Your workouts aren't affected.`) && remove.mutate(p.id)}
          >
            Delete
          </Button>
        </div>
      ))}
      <Link to="/training/plan/new" className={buttonClasses('outline')}>
        Start a new plan
      </Link>
    </Card>
  )
}

