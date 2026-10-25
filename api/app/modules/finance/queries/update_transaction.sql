-- Edits a transaction's own fields. Its status and recurring rule don't change.
UPDATE finance.transactions
SET kind = %(kind)s, amount = %(amount)s, occurred_on = %(occurred_on)s,
    payee = %(payee)s, description = %(description)s, notes = %(notes)s
WHERE id = %(transaction_id)s AND deleted_at IS NULL
RETURNING id, kind, amount, occurred_on, payee, description, notes, status, recurring_transaction_id
