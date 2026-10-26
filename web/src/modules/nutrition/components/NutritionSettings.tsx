import { Card } from '@/shared/ui/card'
import { Checkbox } from '@/shared/ui/checkbox'

import { usePreferences, useUpdatePreferences } from '../api'

/** Settings page section: which nutrients show anywhere in Nutrition. Saves on each change. */
export function NutritionSettings() {
  const prefs = usePreferences()
  const update = useUpdatePreferences()
  if (!prefs.data) return null
  const tracked = prefs.data.tracked_nutrients

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">Nutrition</h2>
        <p className="text-sm text-muted">
          Nutrients you track. Only these show on your daily sheets, history and food repo.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {prefs.data.nutrients.map((n) => (
          <Checkbox
            key={n.key}
            id={`track-${n.key}`}
            checked={tracked.includes(n.key)}
            onChange={(on) =>
              update.mutate(on ? [...tracked, n.key] : tracked.filter((k) => k !== n.key))
            }
            label={`${n.label} (${n.unit})`}
          />
        ))}
      </div>
      {update.isError && <p className="text-sm text-red-700">Couldn't save. Try again.</p>}
    </Card>
  )
}
