import './index.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AuthGate } from './app/AuthGate'
import { ModuleRegistryProvider } from './app/module-registry'
import { MODULES } from './app/modules'
import { router } from './app/router'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <QueryClientProvider client={queryClient}>
        <ModuleRegistryProvider value={MODULES}>
          <RouterProvider router={router} />
        </ModuleRegistryProvider>
      </QueryClientProvider>
    </AuthGate>
  </StrictMode>,
)
