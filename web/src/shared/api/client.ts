import createClient from 'openapi-fetch'

import type { components, paths } from './schema'

/** Typed API client. Paths, params and bodies are checked against schema.d.ts. */
export const api = createClient<paths>({ baseUrl: import.meta.env.VITE_API_URL ?? '/api' })

export type User = components['schemas']['UserOut']
export type UserUpdate = components['schemas']['UserUpdate']
export type ModuleInfo = components['schemas']['ModuleOut']

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API request failed with status ${status}`)
  }
}

/** openapi-fetch returns { data, error }; TanStack Query wants a value or a thrown error. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.error !== undefined || result.data === undefined) {
    throw new ApiError(result.response.status, result.error)
  }
  return result.data
}
