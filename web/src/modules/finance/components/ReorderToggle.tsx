import { ArrowUpDown, Check } from 'lucide-react'

import { Button } from '@/shared/ui/button'

/** "Reorder" / "Done" button that puts a page into drag-to-reorder mode. */
export function ReorderToggle({
  reordering,
  onChange,
}: {
  reordering: boolean
  onChange: (reordering: boolean) => void
}) {
  return reordering ? (
    <Button onClick={() => onChange(false)}>
      <Check className="size-5" />
      Done
    </Button>
  ) : (
    <Button variant="outline" onClick={() => onChange(true)}>
      <ArrowUpDown className="size-4" />
      Reorder
    </Button>
  )
}
