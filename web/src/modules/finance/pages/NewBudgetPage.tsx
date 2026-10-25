import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'

import { errorMessage } from '@/shared/api/client'
import { useMe } from '@/shared/api/hooks'
import { todayIn } from '@/shared/lib/dates'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Field, inputClasses } from '@/shared/ui/field'
import { PageHeader } from '@/shared/ui/page'
import { Segmented } from '@/shared/ui/segmented'

import { type Budget, type BudgetCreate, useBudgets, useCreateBudget } from '../api'

type PeriodType = BudgetCreate['period_type']

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function NewBudgetPage() {
  const me = useMe()
  const budgets = useBudgets()
  const navigate = useNavigate()
  const create = useCreateBudget()
  const today = todayIn(me.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
  const thisYear = Number(today.slice(0, 4))

  const [periodType, setPeriodType] = useState<PeriodType>('month')
  // `undefined` = not touched yet, so use the suggestion (which can arrive after load).
  const [pickedMonth, setPickedMonth] = useState<{ year: number; month: number }>()
  const [day, setDay] = useState(today)
  const [year, setYear] = useState(thisYear)
  const [pickedSource, setPickedSource] = useState<string>() // '' = blank budget
  const [name, setName] = useState('')

  const sameType = (budgets.data ?? []).filter((b) => b.period_type === periodType)
  const { year: monthYear, month } = pickedMonth ?? suggestedMonth(today, budgets.data ?? [])
  const sourceId = pickedSource ?? sameType[0]?.id ?? ''

  // The API snaps any date to the start of its period, so send a date inside it.
  const periodDate =
    periodType === 'month'
      ? `${monthYear}-${String(month).padStart(2, '0')}-01`
      : periodType === 'year'
        ? `${year}-01-01`
        : day

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    create.mutate(
      {
        period_type: periodType,
        period_date: periodDate,
        name: name.trim() || null,
        copy_from_budget_id: sourceId || null,
      },
      {
        onSuccess: (budget) =>
          navigate({ to: '/finance/budgets/$budgetId', params: { budgetId: budget.id } }),
      },
    )
  }

  return (
    <>
      <PageHeader title="New budget" />
      <Card>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <Field label="Covers">
            <Segmented
              label="Budget period"
              value={periodType}
              onChange={(value) => {
                setPeriodType(value)
                setPickedSource(undefined) // re-default to the latest budget of the new type
              }}
              options={[
                { value: 'month', label: 'A month' },
                { value: 'week', label: 'A week' },
                { value: 'year', label: 'A year' },
              ]}
            />
          </Field>

          {periodType === 'month' && (
            <Field label="Month">
              <div className="flex gap-2">
                <select
                  aria-label="Month"
                  value={month}
                  onChange={(e) => setPickedMonth({ year: monthYear, month: Number(e.target.value) })}
                  className={inputClasses}
                >
                  {MONTHS.map((label, i) => (
                    <option key={label} value={i + 1}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Year"
                  value={monthYear}
                  onChange={(e) => setPickedMonth({ year: Number(e.target.value), month })}
                  className={inputClasses + ' w-32'}
                >
                  {yearOptions(thisYear).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
          )}
          {periodType === 'week' && (
            <Field label="Any day in the week" htmlFor="day" hint="Weeks start on the day set in Settings.">
              <input
                id="day"
                type="date"
                required
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className={inputClasses}
              />
            </Field>
          )}
          {periodType === 'year' && (
            <Field label="Year" htmlFor="year">
              <select
                id="year"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className={inputClasses}
              >
                {yearOptions(thisYear).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field
            label="Start from"
            htmlFor="source"
            hint={
              sourceId
                ? 'Copies its items, categories and planned amounts. Transactions are not copied.'
                : 'Start with no items.'
            }
          >
            <select
              id="source"
              value={sourceId}
              onChange={(e) => setPickedSource(e.target.value)}
              className={inputClasses}
            >
              <option value="">Blank budget</option>
              {sameType.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Name (optional)" htmlFor="name" hint="Leave blank to name it after the period.">
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="e.g. October – Vacation"
              className={inputClasses}
            />
          </Field>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create budget'}
            </Button>
            {create.isError && <p className="text-sm text-red-700">{errorMessage(create.error)}</p>}
          </div>
        </form>
      </Card>
    </>
  )
}

/** Next to plan: the month after the latest monthly budget, if that's not in the past. */
function suggestedMonth(today: string, budgets: Budget[]): { year: number; month: number } {
  const current = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }
  const latest = budgets
    .filter((b) => b.period_type === 'month')
    .map((b) => b.period_start)
    .sort()
    .at(-1)
  if (!latest || latest.slice(0, 7) < today.slice(0, 7)) return current
  const [y, m] = latest.split('-').map(Number)
  return m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 }
}

function yearOptions(thisYear: number): number[] {
  return [thisYear - 1, thisYear, thisYear + 1, thisYear + 2]
}
