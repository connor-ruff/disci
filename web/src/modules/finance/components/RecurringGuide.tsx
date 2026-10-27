import type { ReactNode } from 'react'

import { Sheet } from '@/shared/ui/sheet'

/** How recurring transactions work, opened from the Recurring page's help button. */
export function RecurringGuide({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="How recurring works">
      <div className="flex flex-col gap-5 pb-2">
        <Section title="What it does">
          A recurring transaction is money that moves on a schedule: rent, a subscription, a paycheck. On each date,
          Disci logs the transaction for you. It never logs dates from before you created it.
        </Section>

        <Section title="Name and budget item">
          The <b>name</b> is just what you call it. The <b>budget item</b> is where the money should count. It's
          matched in each budget by name (capitalization and extra spaces don't matter) <i>and</i> category, so it
          works with budgets you haven't made yet.
        </Section>

        <Section title="Auto-apply on">
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>
              No approval needed. On the date, it counts toward the matching item in <b>every budget</b> that covers
              that date (a monthly and a yearly one, say).
            </li>
            <li>
              Each time, a note lands in the Inbox under <b>Applied automatically</b>, so you can see what happened.
            </li>
            <li>
              If a budget has no matching item, Disci doesn't make one up. The Inbox asks you to pick an item there,
              add a new one, or skip that budget.
            </li>
            <li>If no budget covers the date yet, it waits in the Inbox as if auto-apply were off.</li>
          </ul>
        </Section>

        <Section title="Auto-apply off">
          Each time it comes up, it waits in the Inbox under <b>Needs you</b> and counts nowhere until you approve it.
          When you do, you can fix the amount and pick where it counts. Rejecting it discards that one for good.
        </Section>

        <Section title="Which should I use?">
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>
              <b>On</b> for fixed amounts that always land in the same place, like rent or Netflix.
            </li>
            <li>
              <b>Off</b> for bills that vary, like electricity, so you enter the real amount, or when you'd rather
              decide each time.
            </li>
          </ul>
        </Section>

        <Section title="Changing or deleting">
          Edits apply from the next date on. Deleting stops future ones. Either way, transactions it already logged
          stay as they are.
        </Section>
      </div>
    </Sheet>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 font-semibold">{title}</h3>
      <div className="text-sm text-muted [&_b]:font-semibold [&_b]:text-foreground">{children}</div>
    </section>
  )
}
