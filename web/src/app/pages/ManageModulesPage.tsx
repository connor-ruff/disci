import { Blocks } from 'lucide-react'

import { useModules, useSetModuleEnabled } from '@/shared/api/hooks'
import { Card } from '@/shared/ui/card'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'
import { Switch } from '@/shared/ui/switch'

import { useModuleRegistry } from '../module-registry'

export function ManageModulesPage() {
  const registry = useModuleRegistry()
  const modules = useModules()
  const setEnabled = useSetModuleEnabled()

  return (
    <>
      <PageHeader
        title="Modules"
        description="Turn on only what you need. Turning a module off hides it but keeps its data."
      />

      {modules.isPending && <LoadingState />}
      {modules.isError && <ErrorState error={modules.error} />}

      <div className="flex flex-col gap-3">
        {modules.data?.map((info) => {
          const Icon = registry.find((m) => m.key === info.key)?.icon ?? Blocks
          const switchId = `module-${info.key}`
          const pending = setEnabled.isPending && setEnabled.variables?.key === info.key
          return (
            <Card key={info.key} className="flex items-center gap-4">
              <Icon className="size-8 shrink-0 text-accent" />
              <label htmlFor={switchId} className="flex-1 cursor-pointer">
                <span className="block font-semibold">{info.name}</span>
                <span className="block text-sm text-muted">{info.description}</span>
              </label>
              <Switch
                id={switchId}
                checked={pending ? setEnabled.variables?.enabled : info.enabled}
                disabled={pending}
                onCheckedChange={(enabled) => setEnabled.mutate({ key: info.key, enabled })}
              />
            </Card>
          )
        })}
      </div>
    </>
  )
}
