import { useState } from 'react'

import { Card } from '@/shared/ui/card'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'

import { type CommonItem, useCommon, useSaveCommon, useTypes } from '../api'
import { CommonRow } from '../components/CommonRow'
import { EditTypesButton } from '../components/EditTypesButton'
import { type ItemSheetState, ItemSheet } from '../components/ItemSheet'
import { QuickAdd } from '../components/QuickAdd'
import { TypesSheet } from '../components/TypesSheet'
import { type Group, groupByType } from '../groups'

/** The things you buy often, by type. Add one to the list in a tap; tap its name to edit it. */
export function CommonPage() {
  const common = useCommon()
  const types = useTypes()
  const [sheet, setSheet] = useState<ItemSheetState>(null)
  const [editingTypes, setEditingTypes] = useState(false)

  const error = common.error ?? types.error
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title="Common items"
          description="Things you buy often. Add one to your shopping list in a tap."
        />
        <EditTypesButton onClick={() => setEditingTypes(true)} />
      </div>

      {(common.isPending || types.isPending) && <LoadingState />}
      {error && <ErrorState error={error} />}
      {common.data && types.data && (
        <div className="flex flex-col gap-4">
          {groupByType(types.data, common.data).map((g) => (
            <CommonCard key={g.typeId ?? ''} group={g} onOpen={(c) => setSheet({ common: c })} />
          ))}
        </div>
      )}

      <ItemSheet state={sheet} onClose={() => setSheet(null)} />
      <TypesSheet open={editingTypes} onOpenChange={setEditingTypes} />
    </>
  )
}

function CommonCard({ group, onOpen }: { group: Group<CommonItem>; onOpen: (c: CommonItem) => void }) {
  const save = useSaveCommon()
  return (
    <Card className="p-0">
      <h2 className="px-4 pt-4 pb-2 text-lg font-semibold">{group.name}</h2>
      {group.rows.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {group.rows.map((c) => (
            <li key={c.id}>
              <CommonRow common={c} onOpen={() => onOpen(c)} />
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-border p-3">
        <QuickAdd
          placeholder={group.typeId ? `New common item in ${group.name}` : 'New common item'}
          pending={save.isPending}
          error={save.error}
          onAdd={(name, reset) => save.mutate({ body: { name, shopping_type_id: group.typeId } }, { onSuccess: reset })}
        />
      </div>
    </Card>
  )
}
