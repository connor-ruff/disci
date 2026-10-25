import { Link } from '@tanstack/react-router'
import { House, LayoutGrid, Settings, X } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'

import { useModules } from '@/shared/api/hooks'
import { Button } from '@/shared/ui/button'
import { Drawer } from '@/shared/ui/drawer'

import { useModuleRegistry } from './module-registry'

type ModuleMenuProps = { open: boolean; onOpenChange: (open: boolean) => void }

/** The ☰ menu: Home, the user's enabled modules, then Manage modules and Settings. */
export function ModuleMenu({ open, onOpenChange }: ModuleMenuProps) {
  const registry = useModuleRegistry()
  const modules = useModules()

  const enabled = (modules.data ?? []).flatMap((info) => {
    const module = registry.find((m) => m.key === info.key)
    return info.enabled && module ? [{ ...info, icon: module.icon }] : []
  })

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Menu">
      <div className="flex h-14 items-center justify-between px-4">
        <span className="text-lg font-semibold tracking-tight">Disci</span>
        <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => onOpenChange(false)}>
          <X className="size-6" />
        </Button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 pb-4">
        <MenuLink to="/" icon={House}>
          Home
        </MenuLink>

        {enabled.length > 0 && (
          <>
            <Divider />
            {enabled.map((m) => (
              <MenuLink key={m.key} to={`/${m.key}`} icon={m.icon}>
                {m.name}
              </MenuLink>
            ))}
          </>
        )}

        <Divider />
        <MenuLink to="/modules" icon={LayoutGrid}>
          Manage modules
        </MenuLink>
        <MenuLink to="/settings" icon={Settings}>
          Settings
        </MenuLink>
      </nav>
    </Drawer>
  )
}

function MenuLink({
  to,
  icon: Icon,
  children,
}: {
  to: string
  icon: ComponentType<{ className?: string }>
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === '/' }}
      className="flex h-12 items-center gap-3 rounded-lg px-3 font-medium hover:bg-highlight"
      activeProps={{ className: 'bg-highlight' }}
    >
      <Icon className="size-5 text-accent" />
      {children}
    </Link>
  )
}

function Divider() {
  return <hr className="my-2 border-border" />
}
