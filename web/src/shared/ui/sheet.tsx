import { Dialog } from 'radix-ui'
import { X } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

import { Button } from './button'

type SheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
}

/** A form panel: slides up from the bottom on phones, a centered dialog on wider screens. */
export function Sheet({ open, onOpenChange, title, children }: SheetProps) {
  const keyboard = useKeyboardInset(open)
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-black/30" />
        <Dialog.Content
          aria-describedby={undefined}
          // Focus the panel, not its first field. Focusing an input while the panel is still
          // sliding up makes iOS raise the keyboard and scroll to where the input was
          // mid-animation, so the field ends up hidden behind the keyboard.
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            ;(event.currentTarget as HTMLElement | null)?.focus()
          }}
          // The on-screen keyboard covers the page rather than shrinking it, so a short panel
          // pinned to the bottom ends up behind it. Sit on top of the keyboard instead.
          style={keyboard ? { bottom: keyboard.bottom, maxHeight: keyboard.height * 0.9, paddingBottom: 0 } : undefined}
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

/** How far the on-screen keyboard reaches up from the bottom of the page, and the height left above it. */
function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState<{ bottom: number; height: number } | null>(null)

  useEffect(() => {
    const viewport = window.visualViewport
    // Wider screens show a centered dialog, which stays put.
    if (!active || !viewport || window.matchMedia('(min-width: 640px)').matches) return
    function update() {
      // The visible area's bottom edge, measured up from the bottom of the page's fixed-position box.
      const bottom = document.documentElement.clientHeight - viewport!.height - viewport!.offsetTop
      // Small gaps are toolbars and rounding, not a keyboard.
      setInset(bottom > 40 ? { bottom, height: viewport!.height } : null)
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      setInset(null)
    }
  }, [active])

  return inset
}
