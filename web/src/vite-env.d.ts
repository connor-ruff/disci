/// <reference types="vite/client" />

/** Build-time config. Production values come from scripts/deploy.sh (SSM). */
interface ImportMetaEnv {
  /** API base URL. Defaults to /api (the dev server's proxy to the local API). */
  readonly VITE_API_URL?: string
  /** 'dev' (default): no login, the API acts as the seeded dev user. 'cognito': real login. */
  readonly VITE_AUTH_MODE?: 'dev' | 'cognito'
  readonly VITE_COGNITO_AUTHORITY?: string
  readonly VITE_COGNITO_CLIENT_ID?: string
  /** Hosted login domain, e.g. https://disci-xxxx.auth.us-east-2.amazoncognito.com */
  readonly VITE_COGNITO_DOMAIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
