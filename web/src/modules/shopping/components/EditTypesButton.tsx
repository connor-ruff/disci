import { Tags } from 'lucide-react'

import { Button } from '@/shared/ui/button'

/** Header button that opens the Shopping types sheet. */
export function EditTypesButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="icon" aria-label="Edit shopping types" title="Edit shopping types" onClick={onClick}>
      <Tags className="size-4" />
    </Button>
  )
}
