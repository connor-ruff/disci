import { Link } from '@tanstack/react-router'
import { ChevronRight, Wallet } from 'lucide-react'

import { Card } from '@/shared/ui/card'

export function FinanceHomeCard() {
  return (
    <Link to="/finance" className="block rounded-xl">
      <Card className="flex items-center gap-4 transition hover:bg-highlight">
        <Wallet className="size-8 shrink-0 text-accent" />
        <div className="flex-1">
          <h2 className="font-semibold">Finance</h2>
          <p className="text-sm text-muted">Budget vs. actual will show here.</p>
        </div>
        <ChevronRight className="size-5 text-muted" />
      </Card>
    </Link>
  )
}
