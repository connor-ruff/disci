import { cn } from '@/shared/lib/cn'
import { Field, inputClasses } from '@/shared/ui/field'
import { Switch } from '@/shared/ui/switch'

import type { PlanFields as Fields } from '../api'

/** A plan's details: name, race and dates. */
export function PlanDetailsFields({ value, onChange }: { value: Fields; onChange: (value: Fields) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Field label="Plan name" htmlFor="plan-name">
        <input
          id="plan-name"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          maxLength={100}
          required
          placeholder="NYC Marathon 2027"
          className={inputClasses}
        />
      </Field>
      <Field label="Race (optional)" htmlFor="plan-race">
        <input
          id="plan-race"
          value={value.race_name ?? ''}
          onChange={(e) => onChange({ ...value, race_name: e.target.value || null })}
          maxLength={100}
          placeholder="NYC Marathon"
          className={inputClasses}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Plan starts" htmlFor="plan-start">
          <input
            id="plan-start"
            type="date"
            value={value.starts_on}
            onChange={(e) => onChange({ ...value, starts_on: e.target.value })}
            required
            className={inputClasses}
          />
        </Field>
        <Field label="Race day (optional)" htmlFor="plan-race-on">
          <input
            id="plan-race-on"
            type="date"
            value={value.race_on ?? ''}
            onChange={(e) => onChange({ ...value, race_on: e.target.value || null })}
            className={inputClasses}
          />
        </Field>
      </div>
    </div>
  )
}

/** The plan's rules: whether walks count, and when to suggest cross-training. */
export function PlanRulesFields({ value, onChange }: { value: Fields; onChange: (value: Fields) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label htmlFor="plan-walks" className="font-medium">
            Count walk miles
          </label>
          <p className="text-sm text-muted">Walks add to weekly miles and % complete.</p>
        </div>
        <Switch
          id="plan-walks"
          checked={value.count_walk_miles ?? false}
          onCheckedChange={(checked) => onChange({ ...value, count_walk_miles: checked })}
        />
      </div>
      <div className="flex items-center gap-3 border-t border-border pt-3">
        <div className="flex-1">
          <label htmlFor="plan-xt" className="font-medium">
            Suggest cross-training at
          </label>
          <p className="text-sm text-muted">% of the week's target. 90 is the bottom of the ±10% range.</p>
        </div>
        <span className="flex shrink-0 items-center gap-1">
          <input
            id="plan-xt"
            value={String(value.cross_train_at_pct ?? 90)}
            onChange={(e) => onChange({ ...value, cross_train_at_pct: Number(e.target.value.replace(/\D/g, '')) || 0 })}
            inputMode="numeric"
            className={cn(inputClasses, 'w-16 text-right')}
          />
          <span className="text-muted">%</span>
        </span>
      </div>
    </div>
  )
}
