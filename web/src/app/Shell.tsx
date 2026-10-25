import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { Menu, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useModules, useSetModuleEnabled } from '@/shared/api/hooks'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'

import type { ModuleManifest } from './module'
import { useModuleRegistry } from './module-registry'
import { ModuleMenu } from './ModuleMenu'

/** The frame around every page: top bar, module menu, and the module sub-nav. */
export function Shell() {
  const registry = useModuleRegistry()
  const modules = useModules()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [menuOpen, setMenuOpen] = useState(false)

  // Close the menu whenever the page changes.
  useEffect(() => setMenuOpen(false), [pathname])

  // If we're inside a module (/finance/...), find it so we can show its name, tabs, or gate.
  const segment = pathname.split('/')[1]
  const module = registry.find((m) => m.key === segment)
  const info = modules.data?.find((m) => m.key === segment)
  const moduleIsOff = module !== undefined && info !== undefined && !info.enabled

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-1 px-2">
          <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <Menu className="size-6" />
          </Button>
          <Link to="/" className="px-1 text-lg font-semibold tracking-tight">
            Disci
          </Link>
          {info && (
            <span className="truncate text-muted">
              <span aria-hidden> / </span>
              {info.name}
            </span>
          )}
          <Link to="/settings" aria-label="Account settings" className="ml-auto">
            <span className="flex size-11 items-center justify-center rounded-full hover:bg-highlight">
              <UserRound className="size-6" />
            </span>
          </Link>
        </div>
        {module && !moduleIsOff && module.subNav.length > 1 && <SubNav items={module.subNav} />}
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {moduleIsOff ? <ModuleOffPrompt module={module} name={info.name} /> : <Outlet />}
      </main>

      <ModuleMenu open={menuOpen} onOpenChange={setMenuOpen} />
    </div>
  )
}

/** A module's section tabs. Scrolls sideways on narrow screens. */
function SubNav({ items }: { items: ModuleManifest['subNav'] }) {
  return (
    <nav className="mx-auto flex w-full max-w-3xl gap-1 overflow-x-auto px-2 pb-2">
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: true }}
          className="shrink-0 rounded-full px-4 py-2 text-sm font-medium text-muted"
          activeProps={{ className: 'bg-highlight text-foreground' }}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}

/** Shown instead of a module's pages when the user has it turned off. */
function ModuleOffPrompt({ module, name }: { module: ModuleManifest; name: string }) {
  const setEnabled = useSetModuleEnabled()
  const Icon = module.icon
  return (
    <Card className="flex flex-col items-center gap-3 py-8 text-center">
      <Icon className="size-10 text-accent" />
      <h1 className="text-xl font-semibold">{name} is turned off</h1>
      <p className="text-muted">Turn it on to start using it. Any data you had is still here.</p>
      <Button
        disabled={setEnabled.isPending}
        onClick={() => setEnabled.mutate({ key: module.key, enabled: true })}
        className={cn('mt-2')}
      >
        Turn on {name}
      </Button>
    </Card>
  )
}
