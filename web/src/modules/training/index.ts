import { Dumbbell } from 'lucide-react'

import type { ModuleManifest } from '@/app/module'

import { TrainingHomeCard } from './components/TrainingHomeCard'
import { trainingRoute } from './routes'

export const trainingModule: ModuleManifest = {
  key: 'training',
  icon: Dumbbell,
  route: trainingRoute,
  subNav: [
    { label: 'Calendar', to: '/training/calendar' },
    { label: 'History', to: '/training/history' },
  ],
  HomeCard: TrainingHomeCard,
}
