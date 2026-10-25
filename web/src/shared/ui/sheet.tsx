import { Dialog } from 'radix-ui'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from './button'

type SheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
}

/** A form panel: slides up from the bottom on phones, a centered dialog on wider screens. */
export function Sheet({ open, onOpenChange, title, children }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-black/30" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] animate-slide-up flex-col rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:animate-fade-in sm:rounded-2xl"
        >
          <div className="flex items-center justify-between px-4 pt-3">
            <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="size-5" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto px-4 pt-2 pb-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
