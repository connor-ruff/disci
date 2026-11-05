import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'

import { useMe } from '@/shared/api/hooks'
import { errorMessage } from '@/shared/api/client'
import { todayIn } from '@/shared/lib/dates'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { PageHeader } from '@/shared/ui/page'
import { Segmented } from '@/shared/ui/segmented'

import { type Grid, type PlanFields, useCreatePlan, usePlans } from '../api'
import { GridPaste } from '../components/GridPaste'
import { PlanDetailsFields, PlanRulesFields } from '../components/PlanFields'
import { weekStart } from '../format'

/** Start a training plan: details, planned miles (pasted from a sheet or typed in later on
 * the Plan tab) and the plan's rules. The new plan becomes the active one. */
export function NewPlanPage() {
  const me = useMe()
  const navigate = useNavigate()
  const create = useCreatePlan()
  const hasActive = (usePlans().data ?? []).some((p) => p.is_active)
  const today = todayIn(me.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)

  const [fields, setFields] = useState<PlanFields>(() => ({
    name: '',
    race_name: null,
    race_on: null,
    starts_on: weekStart(today, me.data?.week_starts_on ?? 1),
    count_walk_miles: false,
    cross_train_at_pct: 90,
  }))
  const [mode, setMode] = useState<'paste' | 'type'>('paste')
  const [grid, setGrid] = useState<Grid | null>(null)

  function onGrid(next: Grid | null) {
    setGrid(next)
    // The plan starts with its first pasted week, unless the user already picked a day.
    if (next && next.days.length > 0) {
      const first = weekStart(next.days[0].day_on, me.data?.week_starts_on ?? 1)
      setFields((f) => ({ ...f, starts_on: f.starts_on > first ? first : f.starts_on }))
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    create.mutate(
      { ...fields, days: mode === 'paste' ? (grid?.days ?? []) : [], weeks: [], active: true },
      { onSuccess: () => navigate({ to: '/training/plan' }) },
    )
  }

  return (
    <form onSubmit={submit} className="mb-10 flex flex-col gap-4">
      <PageHeader title="Start a training plan" />
      <Card>
        <PlanDetailsFields value={fields} onChange={setFields} />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">Planned miles</h2>
        <Segmented
          label="How to add miles"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'paste', label: 'Paste from a sheet' },
            { value: 'type', label: 'Type them in' },
          ]}
        />
        {mode === 'paste' ? (
          <GridPaste onGrid={onGrid} />
        ) : (
          <p className="text-sm text-muted">Your plan starts empty. On the Plan tab, tap a week and fill in each day's miles and notes.</p>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">Rules</h2>
        <PlanRulesFields value={fields} onChange={setFields} />
      </Card>

      {hasActive && <p className="text-sm text-muted">This becomes your active plan. Your current one moves to past plans; your workouts don't change.</p>}
      {create.isError && <p className="text-sm text-red-700">{errorMessage(create.error)}</p>}
      <Button type="submit" disabled={create.isPending || !fields.name.trim()}>
        {create.isPending ? 'Creating…' : 'Create plan'}
      </Button>
    </form>
  )
}
