import { UserManager, WebStorageStateStore } from 'oidc-client-ts'

/**
 * Sign-in. Locally (VITE_AUTH_MODE=dev, the default) there is none: the API's dev auth
 * acts as the seeded user. In production (cognito) users sign in on Cognito's hosted
 * login page (authorization code + PKCE), and every API call carries their ID token,
 * which API Gateway verifies before the API runs.
 */
const env = import.meta.env

export const authMode: 'dev' | 'cognito' = env.VITE_AUTH_MODE === 'cognito' ? 'cognito' : 'dev'

export const userManager =
  authMode === 'cognito'
    ? new UserManager({
        authority: required(env.VITE_COGNITO_AUTHORITY, 'VITE_COGNITO_AUTHORITY'),
        client_id: required(env.VITE_COGNITO_CLIENT_ID, 'VITE_COGNITO_CLIENT_ID'),
        redirect_uri: `${window.location.origin}/auth/callback`,
        response_type: 'code',
        scope: 'openid email profile',
        // Stay signed in across tabs and restarts; the refresh token renews the session.
        userStore: new WebStorageStateStore({ store: window.localStorage }),
        automaticSilentRenew: true,
      })
    : null

/** The current ID token, if signed in. Attached to API requests. */
export async function getIdToken(): Promise<string | undefined> {
  const user = await userManager?.getUser()
  return user && !user.expired ? user.id_token : undefined
}

/** Clears the local session, then ends the Cognito session too (its logout endpoint). */
export async function signOut() {
  if (!userManager) return
  await userManager.removeUser()
  const logout = new URL('/logout', required(env.VITE_COGNITO_DOMAIN, 'VITE_COGNITO_DOMAIN'))
  logout.searchParams.set('client_id', userManager.settings.client_id)
  logout.searchParams.set('logout_uri', `${window.location.origin}/`)
  window.location.assign(logout)
}

/** The API rejected our token (e.g. revoked): start a fresh sign-in. */
export async function handleUnauthorized() {
  await userManager?.signinRedirect()
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} must be set when VITE_AUTH_MODE=cognito`)
  return value
}
