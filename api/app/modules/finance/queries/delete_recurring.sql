-- Stops future occurrences; transactions it already created stay.
UPDATE finance.recurring_transactions
SET deleted_at = now()
WHERE id = %(recurring_id)s AND deleted_at IS NULL
RETURNING id
