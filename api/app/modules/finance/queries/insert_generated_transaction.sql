-- One per rule per occurrence, ever (the unique index includes deleted rows), so this is
-- safe to run repeatedly.
INSERT INTO finance.transactions
    (user_id, kind, amount, occurred_on, payee, notes, status, recurring_transaction_id,
     scheduled_on, satisfies_checklist)
VALUES (%(user_id)s, %(kind)s, %(amount)s, %(scheduled_on)s, %(payee)s, %(notes)s, %(status)s,
        %(recurring_id)s, %(scheduled_on)s, %(satisfies_checklist)s)
ON CONFLICT (recurring_transaction_id, scheduled_on) WHERE recurring_transaction_id IS NOT NULL
DO NOTHING
RETURNING id
