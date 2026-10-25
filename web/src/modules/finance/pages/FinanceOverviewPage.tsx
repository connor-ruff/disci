import { Wallet } from 'lucide-react'

import { Card } from '@/shared/ui/card'
import { PageHeader } from '@/shared/ui/page'

export function FinanceOverviewPage() {
  return (
    <>
      <PageHeader title="Finance" />
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <Wallet className="size-10 text-accent" />
        <h2 className="text-lg font-semibold">Budgets are on the way</h2>
        <p className="max-w-sm text-muted">
          This is where your budgets, transactions and bills will live.
        </p>
      </Card>
    </>
  )
}
