import { cn } from '@/shared/lib/cn'

type SegmentedProps<T extends string> = {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  label: string
  /** 'sm' fits three or more short labels across a phone. */
  size?: 'md' | 'sm'
}

/** A row of mutually exclusive choices (e.g. Expense / Income). */
export function Segmented<T extends string>({ value, onChange, options, label, size = 'md' }: SegmentedProps<T>) {
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
            'flex-1 rounded-md font-medium text-muted transition',
            size === 'sm' ? 'h-8 px-1 text-xs' : 'h-9 text-sm',
            value === option.value && 'bg-surface text-foreground shadow-sm',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
