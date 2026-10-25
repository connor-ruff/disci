import { LogIn } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'
import { AuthProvider, useAuth } from 'react-oidc-context'

import { userManager } from '@/shared/auth/auth'
import { Button } from '@/shared/ui/button'

/** Renders the app only for signed-in users (a no-op in dev auth mode). */
export function AuthGate({ children }: { children: ReactNode }) {
  if (!userManager) return children
  return (
    <AuthProvider
      userManager={userManager}
      // Drop ?code=...&state=... from the URL once the sign-in callback is handled.
      onSigninCallback={() => window.history.replaceState({}, document.title, '/')}
    >
      <RequireSignIn>{children}</RequireSignIn>
    </AuthProvider>
  )
}

function RequireSignIn({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const attempted = useRef(false)

  const needsSignIn =
    !auth.isLoading && !auth.isAuthenticated && !auth.activeNavigator && !auth.error

  // Signed out or session expired: renew with the refresh token if we have one,
  // otherwise go to the hosted login page.
  useEffect(() => {
    if (!needsSignIn || attempted.current) return
    attempted.current = true
    const renew = auth.user?.refresh_token ? auth.signinSilent() : Promise.reject()
    renew.catch(() => auth.signinRedirect())
  }, [needsSignIn, auth])

  if (auth.isAuthenticated) return children

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="text-2xl font-semibold tracking-tight">Disci</span>
      {auth.error ? (
        <>
          <p className="text-muted">Sign-in failed: {auth.error.message}</p>
          <Button onClick={() => auth.signinRedirect()}>
            <LogIn className="size-5" />
            Try again
          </Button>
        </>
      ) : (
        <p className="text-muted">Signing you in…</p>
      )}
    </div>
  )
}
