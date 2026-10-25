import { Wallet } from 'lucide-react'

import type { ModuleManifest } from '@/app/module'

import { FinanceHomeCard } from './components/FinanceHomeCard'
import { financeRoute } from './routes'

export const financeModule: ModuleManifest = {
  key: 'finance',
  icon: Wallet,
  route: financeRoute,
  // Budgets, Transactions, Recurring and Categories tabs get added as those pages are built.
  subNav: [],
  HomeCard: FinanceHomeCard,
}
