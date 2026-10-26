import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/shared/lib/cn'

import { Card } from './card'

/**
 * The inside of a module's Home card: icon, title, a short subtitle and a small summary
 * (a KPI or a few meters). Each module wraps it in its own <Link> so the card opens it.
 */
export function ModuleCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon
  title: string
  subtitle?: ReactNode
  children?: ReactNode
}) {
  return (
    <Card className="flex h-full flex-col gap-3 transition hover:bg-highlight">
      <div className="flex items-center gap-3">
        <Icon className="size-6 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted" />
      </div>
      {children}
    </Card>
  )
}

/** A thin progress bar: `ratio` of 1 is full (capped); `warn` turns it amber. */
export function Meter({ ratio, warn, className }: { ratio: number; warn?: boolean; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-border', className)}>
      <div
        className={cn('h-full rounded-full', warn ? 'bg-amber-500' : 'bg-accent')}
        style={{ width: `${Math.min(Math.max(ratio, 0), 1) * 100}%` }}
      />
    </div>
  )
}
