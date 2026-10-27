import { ListChecks } from 'lucide-react'

import type { ModuleManifest } from '@/app/module'

import { TasksHomeCard } from './components/TasksHomeCard'
import { tasksRoute } from './routes'

export const tasksModule: ModuleManifest = {
  key: 'tasks',
  icon: ListChecks,
  route: tasksRoute,
  subNav: [
    { label: 'Today', to: '/tasks/today' },
    { label: 'All tasks', to: '/tasks/all' },
    { label: 'Kinds', to: '/tasks/types' },
  ],
  HomeCard: TasksHomeCard,
}
