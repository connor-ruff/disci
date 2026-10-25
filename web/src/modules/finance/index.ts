import { Wallet } from 'lucide-react'

import type { ModuleManifest } from '@/app/module'

import { FinanceHomeCard } from './components/FinanceHomeCard'
import { financeRoute } from './routes'

export const financeModule: ModuleManifest = {
  key: 'finance',
  icon: Wallet,
  route: financeRoute,
  subNav: [
    { label: 'Budgets', to: '/finance/budgets' },
    { label: 'Categories', to: '/finance/categories' },
  ],
  HomeCard: FinanceHomeCard,
}
