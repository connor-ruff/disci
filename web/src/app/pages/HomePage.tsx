import { Link } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'

import { useMe, useModules } from '@/shared/api/hooks'
import { buttonClasses } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'

import { MODULES } from '../modules'

export function HomePage() {
  const me = useMe()
  const modules = useModules()

  if (modules.isPending) return <LoadingState />
  if (modules.isError) return <ErrorState error={modules.error} />

  const enabled = MODULES.filter((m) => modules.data.some((i) => i.key === m.key && i.enabled))

  if (enabled.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <Sparkles className="size-10 text-accent" />
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Disci</h1>
        <p className="max-w-sm text-muted">
          Turn on the parts of life you want to keep on top of. You can change this any time.
        </p>
        <Link to="/modules" className={buttonClasses('primary') + ' mt-2'}>
          Choose modules
        </Link>
      </Card>
    )
  }

  const name = me.data?.display_name
  return (
    <>
      <PageHeader title={name ? `Hi, ${name}` : 'Home'} />
      <div className="grid gap-3 sm:grid-cols-2">
        {enabled.map(({ key, HomeCard }) => (
          <HomeCard key={key} />
        ))}
      </div>
    </>
  )
}
