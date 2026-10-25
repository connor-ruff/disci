import type { HTMLAttributes } from 'react'

import { cn } from '@/shared/lib/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgb(0_36_33/0.04)]',
        className,
      )}
      {...props}
    />
  )
}
