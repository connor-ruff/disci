import { Salad } from 'lucide-react'

import type { ModuleManifest } from '@/app/module'

import { NutritionHomeCard } from './components/NutritionHomeCard'
import { NutritionSettings } from './components/NutritionSettings'
import { nutritionRoute } from './routes'

export const nutritionModule: ModuleManifest = {
  key: 'nutrition',
  icon: Salad,
  route: nutritionRoute,
  subNav: [
    { label: 'Daily', to: '/nutrition/daily' },
    { label: 'History', to: '/nutrition/history' },
    { label: 'Food repo', to: '/nutrition/foods' },
    { label: 'Goals', to: '/nutrition/goals' },
  ],
  HomeCard: NutritionHomeCard,
  SettingsPanel: NutritionSettings,
}
