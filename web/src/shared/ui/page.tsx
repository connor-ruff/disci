import type { ReactNode } from 'react'

export function PageHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-1 text-muted">{description}</p>}
    </div>
  )
}

export function LoadingState() {
  return <p className="text-muted">Loading…</p>
}

export function ErrorState({ error }: { error: Error }) {
  return <p className="text-red-700">Something went wrong: {error.message}</p>
}
