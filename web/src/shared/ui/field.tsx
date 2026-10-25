import type { ReactNode } from 'react'

/** Shared look for text inputs and native selects (native pickers work best on phones). */
export const inputClasses =
  'h-11 w-full rounded-lg border border-border bg-surface px-3 text-base focus-visible:outline-2 focus-visible:outline-accent'

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  )
}
