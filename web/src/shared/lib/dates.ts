/** Today's date (YYYY-MM-DD) in the given IANA timezone, e.g. the user's setting. */
export function todayIn(timezone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
}

/** "2026-10-18" → "Oct 18". Parsed as a calendar date, not a moment, so no timezone shift. */
export function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "2026-10-01".."2026-10-31" → "Oct 1 – Oct 31, 2026". */
export function formatDateRange(start: string, end: string): string {
  return `${formatShortDate(start)} – ${formatShortDate(end)}, ${end.slice(0, 4)}`
}
