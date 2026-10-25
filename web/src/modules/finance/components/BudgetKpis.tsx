import { useState } from 'react'

import { cn } from '@/shared/lib/cn'
import { formatMoney } from '@/shared/lib/money'
import { Card } from '@/shared/ui/card'
import { Segmented } from '@/shared/ui/segmented'

import type { BudgetDetail } from '../api'

type Kpi = 'spent' | 'budget' | 'true'

const STORAGE_KEY = 'disci.finance.kpi'

/** Per-device convenience: remember which KPI was last shown. */
function storedKpi(): Kpi {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'spent' || value === 'budget' || value === 'true') return value
  } catch {
    // Storage can be unavailable (private mode); fall through to the default.
  }
  return 'spent'
}

/**
 * The budget's headline numbers, one at a time: spent vs budgeted expenses, the planned
 * surplus / deficit, and the "true" surplus / deficit (planned income − actual spending).
 */
export function BudgetKpis({ budget }: { budget: BudgetDetail }) {
  const [kpi, setKpi] = useState<Kpi>(storedKpi)

  function choose(next: Kpi) {
    setKpi(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Not remembered; that's fine.
    }
  }

  const plannedIncome = Number(budget.income.planned)
  const plannedExpense = Number(budget.expense.planned)
  const spent = Number(budget.expense.actual)
  const view = kpiView(kpi, plannedIncome, plannedExpense, spent)

  return (
    <Card className="flex flex-col gap-4">
      <Segmented
        label="Budget summary"
        size="sm"
        value={kpi}
        onChange={choose}
        options={[
          { value: 'spent', label: 'Spent vs budget' },
          { value: 'budget', label: 'Budget surplus' },
          { value: 'true', label: 'True surplus' },
        ]}
      />
      <div className="flex items-center gap-4">
        <Ring ratio={view.ratio} warn={view.warn} caption={view.ringCaption} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">{view.title}</p>
          <p className={cn('mt-0.5 text-2xl font-semibold', view.warn && 'text-amber-700')}>
            {formatMoney(view.value)}
          </p>
          <p className="text-sm text-muted">{view.detail}</p>
          <p className={cn('mt-1 text-sm font-medium', view.warn ? 'text-amber-700' : 'text-foreground')}>
            {view.footnote}
          </p>
        </div>
      </div>
    </Card>
  )
}

type KpiView = {
  title: string
  value: number
  detail: string
  footnote: string
  /** What the ring fills with (0..1+), or null when there's nothing to compare against. */
  ratio: number | null
  ringCaption: string
  warn: boolean
}

function kpiView(kpi: Kpi, plannedIncome: number, plannedExpense: number, spent: number): KpiView {
  const share = (part: number, whole: number) => (whole > 0 ? part / whole : null)

  if (kpi === 'spent') {
    const left = plannedExpense - spent
    return {
      title: 'Spent vs budget',
      value: spent,
      detail: `of ${formatMoney(plannedExpense)} budgeted expenses`,
      footnote: left >= 0 ? `${formatMoney(left)} left to spend` : `${formatMoney(-left)} over budget`,
      ratio: share(spent, plannedExpense),
      ringCaption: 'of budget',
      warn: left < 0,
    }
  }
  if (kpi === 'budget') {
    const surplus = plannedIncome - plannedExpense
    return {
      title: surplus < 0 ? 'Budget deficit' : 'Budget surplus',
      value: surplus,
      detail: `${formatMoney(plannedIncome)} planned income − ${formatMoney(plannedExpense)} planned expenses`,
      footnote: surplus < 0 ? 'More is planned to spend than to earn' : 'Planned income not yet given a job',
      ratio: share(plannedExpense, plannedIncome),
      ringCaption: 'of income',
      warn: surplus < 0,
    }
  }
  const surplus = plannedIncome - spent
  return {
    title: surplus < 0 ? 'True deficit' : 'True surplus',
    value: surplus,
    detail: `${formatMoney(plannedIncome)} planned income − ${formatMoney(spent)} spent`,
    footnote: surplus < 0 ? 'Spending is past planned income' : 'Planned income not spent yet',
    ratio: share(spent, plannedIncome),
    ringCaption: 'of income',
    warn: surplus < 0,
  }
}

/** A donut meter: the share filled, with the percentage in the middle. */
function Ring({ ratio, warn, caption }: { ratio: number | null; warn: boolean; caption: string }) {
  const size = 96
  const stroke = 10
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const filled = Math.min(Math.max(ratio ?? 0, 0), 1)
  const percent = ratio === null ? '—' : `${Math.round(ratio * 100)}%`

  return (
    <div className="relative size-24 shrink-0" role="img" aria-label={`${percent} ${caption}`}>
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-border" />
        {filled > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled * circumference} ${circumference}`}
            className={cn('transition-[stroke-dasharray] duration-500', warn ? 'stroke-amber-500' : 'stroke-accent')}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
        <span className="text-lg leading-none font-semibold">{percent}</span>
        <span className="mt-1 text-[10px] leading-tight text-muted">{caption}</span>
      </div>
    </div>
  )
}
