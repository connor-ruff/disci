import { Plus, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { useMe } from '@/shared/api/hooks'
import { errorMessage } from '@/shared/api/client'
import { formatShortDate, todayIn } from '@/shared/lib/dates'
import { Button } from '@/shared/ui/button'
import { Field, inputClasses } from '@/shared/ui/field'
import { Segmented } from '@/shared/ui/segmented'
import { Sheet } from '@/shared/ui/sheet'

import {
  type Lift,
  type Workout,
  type WorkoutType,
  useDeleteWorkout,
  useLifts,
  useLocations,
  useSaveWorkout,
} from '../api'
import { TYPE_LABELS, TYPE_ORDER, formatClock, formatWeight, parseClock } from '../format'

/** Closed (null), logging a new workout ({}), or editing one. */
export type WorkoutSheetState = { workout?: Workout } | null

export function WorkoutSheet({ state, onClose }: { state: WorkoutSheetState; onClose: () => void }) {
  return (
    <Sheet open={state !== null} onOpenChange={(open) => !open && onClose()} title={state?.workout ? 'Workout' : 'Log workout'}>
      {state && <WorkoutForm key={state.workout?.id ?? 'new'} workout={state.workout} onDone={onClose} />}
    </Sheet>
  )
}

type SetRow = { weight: string; reps: string }
type LiftBlock = { key: number; name: string; sets: SetRow[] }

let nextKey = 1

/** A workout's sets as blocks of consecutive sets of the same lift, in the order done. */
function toBlocks(workout: Workout | undefined): LiftBlock[] {
  const blocks: LiftBlock[] = []
  for (const s of workout?.sets ?? []) {
    const last = blocks[blocks.length - 1]
    const row = { weight: s.weight_num == null ? '' : formatWeight(s.weight_num), reps: String(s.reps) }
    if (last && last.name === s.lift_name) last.sets.push(row)
    else blocks.push({ key: nextKey++, name: s.lift_name, sets: [row] })
  }
  return blocks
}

const text = (value: string | null | undefined) => value ?? ''
const blankToNull = (value: string) => (value.trim() === '' ? null : value.trim())
const intOrNull = (value: string) => (value.trim() === '' ? null : Number(value))

function WorkoutForm({ workout, onDone }: { workout?: Workout; onDone: () => void }) {
  const me = useMe()
  const save = useSaveWorkout()
  const remove = useDeleteWorkout()
  const today = todayIn(me.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)

  const [type, setType] = useState<WorkoutType>(workout?.type ?? 'run')
  const [date, setDate] = useState(workout?.date ?? today)
  const [time, setTime] = useState(workout?.time_in_sec ? formatClock(workout.time_in_sec) : '')
  const [miles, setMiles] = useState(workout?.miles != null ? String(Number(workout.miles)) : '')
  const [heartRate, setHeartRate] = useState(text(workout?.avg_heart_rate?.toString()))
  const [elevation, setElevation] = useState(text(workout?.elevation_gain_ft?.toString()))
  const [location, setLocation] = useState(text(workout?.location))
  const [description, setDescription] = useState(text(workout?.description))
  const [reflection, setReflection] = useState(text(workout?.reflection))
  const [blocks, setBlocks] = useState<LiftBlock[]>(() => toBlocks(workout))
  const [invalid, setInvalid] = useState<string | null>(null)

  const isLift = type === 'lift'
  const needsMiles = type === 'run' || type === 'walk'

  function submit(event: FormEvent) {
    event.preventDefault()
    const seconds = time.trim() === '' ? null : parseClock(time)
    if (time.trim() !== '' && seconds === null) return setInvalid('Time should look like 48:30 or 1:05:00.')
    if (needsMiles && miles.trim() === '') return setInvalid(`A ${type} needs miles.`)
    const sets = isLift
      ? blocks.flatMap((b) =>
          b.name.trim() === ''
            ? []
            : b.sets
                .filter((s) => s.reps.trim() !== '')
                .map((s) => ({ lift_name: b.name.trim(), reps: Number(s.reps), weight_num: blankToNull(s.weight) })),
        )
      : []
    setInvalid(null)
    save.mutate(
      {
        id: workout?.id,
        body: {
          type,
          date,
          time_in_sec: seconds,
          miles: isLift ? null : blankToNull(miles),
          avg_heart_rate: isLift ? null : intOrNull(heartRate),
          elevation_gain_ft: isLift ? null : intOrNull(elevation),
          location: blankToNull(location),
          description: blankToNull(description),
          reflection: blankToNull(reflection),
          sets,
        },
      },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Segmented
        label="Activity"
        value={type}
        onChange={setType}
        options={TYPE_ORDER.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="training-date">
          <input id="training-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required className={inputClasses} />
        </Field>
        <Field label="Time (optional)" htmlFor="training-time">
          <input id="training-time" value={time} onChange={(e) => setTime(e.target.value)} placeholder={isLift ? '55:00' : '48:30'} inputMode="numeric" className={inputClasses} />
        </Field>
      </div>

      {!isLift && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label={needsMiles ? 'Miles' : 'Miles (optional)'} htmlFor="training-miles">
              <input id="training-miles" value={miles} onChange={(e) => setMiles(e.target.value)} inputMode="decimal" placeholder="5.0" required={needsMiles} className={inputClasses} />
            </Field>
            <Field label="Avg heart rate" htmlFor="training-hr">
              <input id="training-hr" value={heartRate} onChange={(e) => setHeartRate(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="bpm" className={inputClasses} />
            </Field>
          </div>
          <Field label="Elevation gain (ft)" htmlFor="training-elev">
            <input id="training-elev" value={elevation} onChange={(e) => setElevation(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputClasses} />
          </Field>
        </>
      )}

      <LocationField value={location} onChange={setLocation} />

      <Field label={isLift ? 'Body parts / description (optional)' : 'Description (optional)'} htmlFor="training-desc">
        <input
          id="training-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={300}
          placeholder={isLift ? 'e.g. Push, back/chest, legs' : 'e.g. easy run, tempo'}
          className={inputClasses}
        />
      </Field>

      {isLift && <LiftsEditor blocks={blocks} onChange={setBlocks} showLastTime={!workout} />}

      <Field label="Reflection (optional)" htmlFor="training-reflection">
        <textarea
          id="training-reflection"
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          maxLength={5000}
          rows={3}
          placeholder="How did it feel? Anything to remember next time?"
          className={inputClasses + ' h-auto py-2'}
        />
      </Field>

      {(invalid || save.isError) && <p className="text-sm text-red-700">{invalid ?? errorMessage(save.error)}</p>}

      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? 'Saving…' : workout ? 'Save' : 'Log workout'}
      </Button>
      {workout && (
        <Button
          variant="ghost"
          className="text-red-700"
          disabled={remove.isPending}
          onClick={() => window.confirm('Delete this workout?') && remove.mutate(workout.id, { onSuccess: onDone })}
        >
          Delete workout
        </Button>
      )}
    </form>
  )
}

/** Free text, with recent locations a tap away. */
function LocationField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const recent = (useLocations().data ?? []).filter((l) => l !== value).slice(0, 4)
  return (
    <Field label="Location (optional)" htmlFor="training-location">
      <input
        id="training-location"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={100}
        placeholder="e.g. Hoboken, Treadmill, Home gym"
        className={inputClasses}
      />
      {recent.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {recent.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => onChange(l)}
              className="h-8 rounded-full border border-border bg-surface px-3 text-sm hover:bg-highlight"
            >
              {l}
            </button>
          ))}
        </div>
      )}
    </Field>
  )
}

/** "Last time (Nov 2): 185 × 5, 185 × 4" for a lift in the catalog. */
function lastTime(lifts: Lift[], name: string): string | null {
  const lift = lifts.find((l) => l.name.toLowerCase() === name.trim().toLowerCase())
  if (!lift || !lift.last_done_on || lift.last_sets.length === 0) return null
  const sets = lift.last_sets.map((s) => `${formatWeight(s.weight_num)} × ${s.reps}`).join(', ')
  return `Last time (${formatShortDate(lift.last_done_on)}): ${sets}`
}

/** Optional lift detail: lifts in the order done, each with its sets (weight × reps). */
function LiftsEditor({
  blocks,
  onChange,
  showLastTime,
}: {
  blocks: LiftBlock[]
  onChange: (blocks: LiftBlock[]) => void
  /** Only when logging a new workout: when editing, "last time" may be this very workout. */
  showLastTime: boolean
}) {
  const lifts = useLifts().data ?? []
  const update = (key: number, change: (b: LiftBlock) => LiftBlock) =>
    onChange(blocks.map((b) => (b.key === key ? change(b) : b)))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">Lifts and sets (optional)</span>
        <span className="text-xs text-muted">Weight in lb; blank = bodyweight</span>
      </div>
      <datalist id="training-lift-names">
        {lifts.map((l) => (
          <option key={l.id} value={l.name} />
        ))}
      </datalist>

      {blocks.map((block) => {
        const hint = showLastTime ? lastTime(lifts, block.name) : null
        return (
          <div key={block.key} className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <div className="flex items-center gap-2">
              <input
                aria-label="Lift"
                list="training-lift-names"
                value={block.name}
                onChange={(e) => update(block.key, (b) => ({ ...b, name: e.target.value }))}
                placeholder="Lift, e.g. Bench press"
                maxLength={100}
                className={inputClasses}
              />
              <Button variant="ghost" size="icon" aria-label="Remove lift" onClick={() => onChange(blocks.filter((b) => b.key !== block.key))}>
                <X className="size-4" />
              </Button>
            </div>
            {hint && <p className="text-sm text-accent">{hint}</p>}
            <div className="grid grid-cols-[2rem_1fr_1fr_2.75rem] items-center gap-2 text-xs text-muted">
              <span className="text-center">Set</span>
              <span>Weight (lb)</span>
              <span>Reps</span>
              <span />
            </div>
            {block.sets.map((set, i) => (
              <div key={i} className="grid grid-cols-[2rem_1fr_1fr_2.75rem] items-center gap-2">
                <span className="text-center text-sm text-muted">{i + 1}</span>
                <input
                  aria-label={`Set ${i + 1} weight`}
                  value={set.weight}
                  onChange={(e) =>
                    update(block.key, (b) => ({ ...b, sets: b.sets.map((s, j) => (j === i ? { ...s, weight: e.target.value } : s)) }))
                  }
                  inputMode="decimal"
                  placeholder="BW"
                  className={inputClasses}
                />
                <input
                  aria-label={`Set ${i + 1} reps`}
                  value={set.reps}
                  onChange={(e) =>
                    update(block.key, (b) => ({
                      ...b,
                      sets: b.sets.map((s, j) => (j === i ? { ...s, reps: e.target.value.replace(/\D/g, '') } : s)),
                    }))
                  }
                  inputMode="numeric"
                  className={inputClasses}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove set ${i + 1}`}
                  onClick={() => update(block.key, (b) => ({ ...b, sets: b.sets.filter((_, j) => j !== i) }))}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              className="self-start px-2 text-accent"
              // A new set starts as a copy of the one before it: most sets repeat.
              onClick={() => update(block.key, (b) => ({ ...b, sets: [...b.sets, b.sets[b.sets.length - 1] ?? { weight: '', reps: '' }] }))}
            >
              <Plus className="size-4" />
              Add set
            </Button>
          </div>
        )
      })}

      <Button variant="outline" onClick={() => onChange([...blocks, { key: nextKey++, name: '', sets: [{ weight: '', reps: '' }] }])}>
        <Plus className="size-4" />
        Add lift
      </Button>
    </div>
  )
}
