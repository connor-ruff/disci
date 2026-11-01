import { ShoppingCart } from 'lucide-react'

import type { ModuleManifest } from '@/app/module'

import { ShoppingHomeCard } from './components/ShoppingHomeCard'
import { shoppingRoute } from './routes'

export const shoppingModule: ModuleManifest = {
  key: 'shopping',
  icon: ShoppingCart,
  route: shoppingRoute,
  subNav: [
    { label: 'Shopping list', to: '/shopping/list' },
    { label: 'Common items', to: '/shopping/common' },
  ],
  HomeCard: ShoppingHomeCard,
}
