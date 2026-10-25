import { type FormEvent, useState } from 'react'

import type { User } from '@/shared/api/client'
import { useMe, useUpdateMe } from '@/shared/api/hooks'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { ErrorState, LoadingState, PageHeader } from '@/shared/ui/page'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DEVICE_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

export function SettingsPage() {
  const me = useMe()
  return (
    <>
      <PageHeader title="Settings" />
      {me.isPending && <LoadingState />}
      {me.isError && <ErrorState error={me.error} />}
      {/* Keyed so the form's fields reset if the user changes. */}
      {me.data && <SettingsForm key={me.data.id} user={me.data} />}
    </>
  )
}

function SettingsForm({ user }: { user: User }) {
  const update = useUpdateMe()
  const [displayName, setDisplayName] = useState(user.display_name ?? '')
  const [timezone, setTimezone] = useState(user.timezone)
  const [weekStartsOn, setWeekStartsOn] = useState(user.week_starts_on)

  const timezones = timezoneOptions(timezone)

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    update.mutate({
      display_name: displayName.trim() || null,
      timezone,
      week_starts_on: weekStartsOn,
    })
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field label="Email">
          <p className="text-muted">{user.email}</p>
        </Field>

        <Field label="Display name" htmlFor="display-name">
          <input
            id="display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
            autoComplete="nickname"
            className={inputClasses}
          />
        </Field>

        <Field label="Timezone" htmlFor="timezone">
          <select
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className={inputClasses}
          >
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
          {timezone !== DEVICE_TIMEZONE && (
            <button
              type="button"
              onClick={() => setTimezone(DEVICE_TIMEZONE)}
              className="mt-1 self-start text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              Use this device's timezone ({DEVICE_TIMEZONE.replaceAll('_', ' ')})
            </button>
          )}
        </Field>

        <Field label="Week starts on" htmlFor="week-start">
          <select
            id="week-start"
            value={weekStartsOn}
            onChange={(e) => setWeekStartsOn(Number(e.target.value))}
            className={inputClasses}
          >
            {WEEKDAYS.map((day, i) => (
              <option key={day} value={i + 1}>
                {day}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
          {update.isSuccess && <span className="text-sm text-muted">Saved</span>}
          {update.isError && <ErrorState error={update.error} />}
        </div>
      </form>
    </Card>
  )
}

const inputClasses =
  'h-11 w-full rounded-lg border border-border bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-accent'

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  )
}

/** All IANA timezones the browser knows, always including the current value. */
function timezoneOptions(current: string): string[] {
  const all = Intl.supportedValuesOf('timeZone')
  return all.includes(current) ? all : [current, ...all]
}
