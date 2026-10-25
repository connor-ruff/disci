import { createRootRoute } from '@tanstack/react-router'

import { NotFoundPage } from './pages/NotFoundPage'
import { Shell } from './Shell'

/** Every page renders inside the shell. Modules attach their routes to this root. */
export const rootRoute = createRootRoute({ component: Shell, notFoundComponent: NotFoundPage })
