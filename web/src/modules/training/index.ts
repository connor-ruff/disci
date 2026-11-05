import { Dumbbell } from 'lucide-react'

import type { ModuleManifest } from '@/app/module'

import { useHasPlans } from './api'
import { TrainingHomeCard } from './components/TrainingHomeCard'
import { trainingRoute } from './routes'

export const trainingModule: ModuleManifest = {
  key: 'training',
  icon: Dumbbell,
  route: trainingRoute,
  subNav: [
    { label: 'Calendar', to: '/training/calendar' },
    { label: 'History', to: '/training/history' },
    // Only once the user has a plan; "Start a plan" on the Calendar leads there first.
    { label: 'Plan', to: '/training/plan', useShown: useHasPlans },
  ],
  HomeCard: TrainingHomeCard,
}
