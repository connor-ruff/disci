import { Link } from '@tanstack/react-router'
import { CircleAlert } from 'lucide-react'

import { cn } from '@/shared/lib/cn'

import { useInboxToDo } from '../api'

/** The "!" on the Inbox tab while something there needs the user. */
export function InboxTabAlert() {
  const count = useInboxToDo()
  if (count === 0) return null
  return (
    <span
      className="flex size-4 items-center justify-center rounded-full bg-amber-500 text-[11px] leading-none font-bold text-white"
      title={`${count} to sort out`}
    >
      !<span className="sr-only">: {count} to sort out</span>
    </span>
  )
}

/** Home card banner: how many Inbox items need the user. Links to the Inbox. */
export function InboxBanner({ className }: { className?: string }) {
  const count = useInboxToDo()
  if (count === 0) return null
  return (
    <Link
      to="/finance/inbox"
      className={cn(
        'flex h-9 items-center gap-2 rounded-lg bg-amber-100 px-3 text-sm font-medium text-amber-900 transition hover:bg-amber-200',
        className,
      )}
    >
      <CircleAlert className="size-5 shrink-0 text-amber-600" />
      <span className="flex-1">
        {count} {count === 1 ? 'thing needs' : 'things need'} you in the Inbox
      </span>
    </Link>
  )
}
