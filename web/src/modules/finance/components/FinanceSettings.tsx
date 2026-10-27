import { Card } from '@/shared/ui/card'
import { Switch } from '@/shared/ui/switch'

import { type Preferences, usePreferences, useUpdatePreferences } from '../api'

const TOGGLES: { key: keyof Preferences; label: string; hint: string }[] = [
  {
    key: 'show_kind_totals',
    label: 'Income and Expenses totals',
    hint: '"$x of $y" beside the Income and Expenses headings on a budget.',
  },
  {
    key: 'show_category_totals',
    label: 'Category totals',
    hint: 'The same beside each category heading.',
  },
]

/** Settings page section: budget page display options. Saves on each change. */
export function FinanceSettings() {
  const prefs = usePreferences()
  const update = useUpdatePreferences()
  if (!prefs.data) return null
  const current = prefs.data

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-sm text-muted">Subtotals to show on your budgets.</p>
      {TOGGLES.map((t) => (
        <label key={t.key} htmlFor={`finance-${t.key}`} className="flex items-center justify-between gap-4">
          <span>
            <span className="block font-medium">{t.label}</span>
            <span className="block text-sm text-muted">{t.hint}</span>
          </span>
          <Switch
            id={`finance-${t.key}`}
            checked={current[t.key]}
            onCheckedChange={(on) => update.mutate({ ...current, [t.key]: on })}
          />
        </label>
      ))}
      {update.isError && <p className="text-sm text-red-700">Couldn't save. Try again.</p>}
    </Card>
  )
}
