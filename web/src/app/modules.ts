import { financeModule } from '@/modules/finance'

import type { ModuleManifest } from './module'

/**
 * The module registry: every module the web app knows how to render.
 * Adding a module = create src/modules/<key>/ exporting a ModuleManifest, add it here.
 */
export const MODULES: ModuleManifest[] = [financeModule]
