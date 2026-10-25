import { RotateCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/shared/lib/cn'

const THRESHOLD = 70 // px of (dampened) pull needed to refresh
const MAX_PULL = 110

/** True when launched from the home screen (no browser reload button there). */
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/**
 * Pull down from the top of any page to reload the app (data and code, so it also
 * picks up new deploys). Only active in the home-screen app; browser tabs already have
 * a reload button and their own pull gesture.
 */
export function PullToRefresh() {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const pullRef = useRef(0)

  useEffect(() => {
    if (!isStandalone()) return

    function onStart(e: TouchEvent) {
      // Only from the very top, and not while a sheet or menu is open.
      const overlayOpen = document.querySelector('[role="dialog"]') !== null
      startY.current = window.scrollY <= 0 && !overlayOpen ? e.touches[0].clientY : null
    }
    function onMove(e: TouchEvent) {
      if (startY.current === null) return
      const distance = e.touches[0].clientY - startY.current
      // Dampened so it feels elastic.
      pullRef.current = distance > 0 ? Math.min(distance * 0.5, MAX_PULL) : 0
      setPull(pullRef.current)
    }
    function onEnd() {
      if (startY.current === null) return
      startY.current = null
      if (pullRef.current >= THRESHOLD) {
        setRefreshing(true)
        window.location.reload()
      } else {
        pullRef.current = 0
        setPull(0)
      }
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  if (pull === 0 && !refreshing) return null
  const ready = pull >= THRESHOLD || refreshing

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center"
      style={{ top: `calc(env(safe-area-inset-top) + ${Math.max(pull - 40, 8)}px)` }}
    >
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm shadow-md">
        <RotateCw
          className={cn('size-4 text-accent', refreshing && 'animate-spin')}
          style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
        />
        <span className="text-muted">
          {refreshing ? 'Refreshing…' : ready ? 'Release to refresh' : 'Pull to refresh'}
        </span>
      </div>
    </div>
  )
}
