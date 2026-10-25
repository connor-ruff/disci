SELECT id, kind, amount, occurred_on, payee, description, notes, status, recurring_transaction_id
FROM finance.transactions
WHERE id = %(transaction_id)s AND deleted_at IS NULL
