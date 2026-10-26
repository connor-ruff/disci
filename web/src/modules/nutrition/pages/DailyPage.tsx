import { DaySheet, useToday } from '../components/DaySheet'

/** Today's food sheet (in the user's timezone). */
export function DailyPage() {
  const today = useToday()
  // Keyed so a sheet left open doesn't carry over when the date rolls over.
  return <DaySheet key={today} date={today} />
}
