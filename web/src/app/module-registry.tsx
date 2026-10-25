import { createContext, useContext } from 'react'

import type { ModuleManifest } from './module'

/**
 * Hands the module registry to the shell through React context. The shell can't import
 * modules.ts directly: modules import the root route, which imports the shell (a cycle).
 */
const ModuleRegistryContext = createContext<ModuleManifest[]>([])

export const ModuleRegistryProvider = ModuleRegistryContext.Provider

export function useModuleRegistry() {
  return useContext(ModuleRegistryContext)
}
