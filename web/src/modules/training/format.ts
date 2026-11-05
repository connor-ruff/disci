import type { WeekStatus, Workout, WorkoutType } from './api'

export const TYPE_LABELS: Record<WorkoutType, string> = { run: 'Run', walk: 'Walk', bike: 'Bike', lift: 'Lift' }
export const TYPE_ORDER: WorkoutType[] = ['run', 'walk', 'bike', 'lift']

/** Badge colors per type (light tint + dark text, readable at small sizes). */
export const TYPE_BADGE: Record<WorkoutType, string> = {
  run: 'bg-teal-100 text-teal-800',
  walk: 'bg-amber-100 text-amber-900',
  bike: 'bg-sky-100 text-sky-800',
  lift: 'bg-violet-100 text-violet-800',
}

/** 2930 → "48:50"; 7260 → "2:01:00". */
export function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

/** "48:50" → 2930, "1:02:00" → 3720, "45" (minutes) → 2700. Null when blank or unreadable. */
export function parseClock(text: string): number | null {
  const parts = text.trim().split(':')
  if (parts.length === 0 || parts[0] === '' || parts.length > 3) return null
  const nums = parts.map(Number)
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null
  const seconds =
    nums.length === 1 ? nums[0] * 60 : nums.length === 2 ? nums[0] * 60 + nums[1] : nums[0] * 3600 + nums[1] * 60 + nums[2]
  return seconds > 0 ? Math.round(seconds) : null
}

/** "5.00" → "5", "5.10" → "5.1". */
export function formatMiles(miles: string | number): string {
  return String(Number(miles))
}

/** "185.00" → "185"; null → "BW" (bodyweight). */
export function formatWeight(weight: string | null | undefined): string {
  return weight == null ? 'BW' : String(Number(weight))
}

/** One line for a list: "Run · 5 mi" / "Lift · 55 min". */
export function workoutTitle(w: Workout): string {
  if (w.miles != null && w.type !== 'lift') return `${TYPE_LABELS[w.type]} · ${formatMiles(w.miles)} mi`
  if (w.time_in_sec) return `${TYPE_LABELS[w.type]} · ${Math.round(w.time_in_sec / 60)} min`
  return TYPE_LABELS[w.type]
}

/** The details after the title: time, pace, place, heart rate, elevation, description. */
export function workoutDetail(w: Workout): string {
  const parts: string[] = []
  if (w.type !== 'lift' && w.miles != null && w.time_in_sec) parts.push(formatClock(w.time_in_sec))
  if (w.pace_sec_per_mile && w.type !== 'bike') parts.push(`${formatClock(w.pace_sec_per_mile)}/mi`)
  if (w.type === 'bike' && w.miles != null && w.time_in_sec) parts.push(`${Math.round(w.time_in_sec / 60)} min`)
  if (w.description) parts.push(w.description)
  if (w.location) parts.push(w.location)
  if (w.avg_heart_rate) parts.push(`${w.avg_heart_rate} bpm`)
  if (w.elevation_gain_ft) parts.push(`${w.elevation_gain_ft} ft gain`)
  return parts.join(' · ')
}

/** Sets grouped by lift, in the order done: [{ name, sets: "185 × 5, 185 × 4" }]. */
export function liftGroups(w: Workout): { name: string; sets: string }[] {
  const out: { name: string; sets: string[] }[] = []
  for (const s of w.sets) {
    if (out.length === 0 || out[out.length - 1].name !== s.lift_name) out.push({ name: s.lift_name, sets: [] })
    out[out.length - 1].sets.push(`${formatWeight(s.weight_num)} × ${s.reps}`)
  }
  return out.map((g) => ({ name: g.name, sets: g.sets.join(', ') }))
}

/** The first day (YYYY-MM-DD) of the week holding `isoDate`, weeks starting on ISO day `weekStartsOn` (1 = Monday). */
export function weekStart(isoDate: string, weekStartsOn: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const isoDay = date.getUTCDay() === 0 ? 7 : date.getUTCDay()
  const back = (isoDay - weekStartsOn + 7) % 7
  date.setUTCDate(date.getUTCDate() - back)
  return date.toISOString().slice(0, 10)
}


/** The week total's colors by status: green in range, red over, yellow under (Q7). */
export const STATUS_STYLE: Record<WeekStatus, string> = {
  none: 'bg-background',
  upcoming: 'border border-dashed border-border bg-surface text-muted',
  in_progress: 'bg-teal-50 text-teal-800',
  under: 'bg-amber-50 text-amber-900 border border-amber-200',
  in_range: 'bg-green-50 text-green-800 border border-green-200',
  over: 'bg-red-50 text-red-800 border border-red-200',
}
