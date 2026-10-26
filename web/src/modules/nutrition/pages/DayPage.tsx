import { Link, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { DaySheet } from '../components/DaySheet'

/** Any day's food sheet, opened from History. Same as Daily, for another day. */
export function DayPage() {
  const { date } = useParams({ from: '/nutrition/history/$date' })
  return (
    <>
      <Link to="/nutrition/history" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
        <ArrowLeft className="size-4" />
        History
      </Link>
      <DaySheet key={date} date={date} />
    </>
  )
}
