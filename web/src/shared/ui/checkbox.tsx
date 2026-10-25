import type { ReactNode } from 'react'

type CheckboxProps = {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  hint?: ReactNode
}

/** A native checkbox with a label and optional hint, sized for touch. */
export function Checkbox({ id, checked, onChange, label, hint }: CheckboxProps) {
  return (
    <div className="flex gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-primary"
      />
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </label>
    </div>
  )
}
