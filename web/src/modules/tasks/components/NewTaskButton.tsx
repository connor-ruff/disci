import { Plus } from 'lucide-react'

import { Button } from '@/shared/ui/button'

/** The floating "New task" button, bottom right. */
export function NewTaskButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 h-12 rounded-full px-4 shadow-lg"
    >
      <Plus className="size-5" />
      New task
    </Button>
  )
}
