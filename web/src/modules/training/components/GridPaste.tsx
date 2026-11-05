import { useEffect, useState } from 'react'

import { errorMessage } from '@/shared/api/client'
import { formatShortDate } from '@/shared/lib/dates'
import { inputClasses } from '@/shared/ui/field'

import { type Grid, useReadGrid } from '../api'
import { formatMiles } from '../format'

/** A box to paste plan rows into (week start date, then Monday..Sunday miles), with a
 * preview of what was read. Reports the parsed grid (or null) as the text changes. */
export function GridPaste({ onGrid }: { onGrid: (grid: Grid | null) => void }) {
  const [text, setText] = useState('')
  const read = useReadGrid()
  const grid = text.trim() ? read.data : undefined

  // Read the grid a moment after the user stops typing or pasting.
  useEffect(() => {
    if (!text.trim()) {
      onGrid(null)
      return
    }
    const timer = setTimeout(() => read.mutate(text, { onSuccess: onGrid }), 300)
    return () => clearTimeout(timer)
  }, [text])

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        Copy the rows from your spreadsheet: the week start date, then Monday through Sunday miles. Leave a day blank
        for rest. A note can follow the number ("6 long run").
      </p>
      <label htmlFor="training-grid" className="text-sm font-medium">
        Pasted rows
      </label>
      <textarea
        id="training-grid"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={'4/26/2027\t\t3\t\t3\t\t6\t'}
        className={inputClasses + ' h-auto py-2 font-mono text-sm'}
      />
      {read.isError && <p className="text-sm text-red-700">{errorMessage(read.error)}</p>}
      {grid && <GridPreview grid={grid} />}
    </div>
  )
}

function GridPreview({ grid }: { grid: Grid }) {
  const firstWeeks = grid.days.slice(0, 9)
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-highlight px-3 py-2 text-sm">
      <p className="font-semibold text-accent">
        Found {grid.weeks} {grid.weeks === 1 ? 'week' : 'weeks'} · {grid.days.length} run days ·{' '}
        {formatMiles(grid.total_miles)} mi
      </p>
      {firstWeeks.length > 0 && (
        <p className="text-muted">
          {firstWeeks.map((d) => `${formatShortDate(d.day_on)}: ${formatMiles(d.planned_miles)}`).join(' · ')}
          {grid.days.length > firstWeeks.length && ' …'}
        </p>
      )}
      {grid.skipped.length > 0 && (
        <details className="text-amber-900">
          <summary>
            {grid.skipped.length} {grid.skipped.length === 1 ? 'thing' : 'things'} couldn't be read
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {grid.skipped.slice(0, 20).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
