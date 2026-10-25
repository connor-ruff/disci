import { cn } from '@/shared/lib/cn'

type SegmentedProps<T extends string> = {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  label: string
}

/** A row of mutually exclusive choices (e.g. Expense / Income). */
export function Segmented<T extends string>({ value, onChange, options, label }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-background p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-9 flex-1 rounded-md text-sm font-medium text-muted transition',
            value === option.value && 'bg-surface text-foreground shadow-sm',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
