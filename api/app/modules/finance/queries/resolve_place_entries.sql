-- When a pending transaction is approved or rejected directly, its "place" entry is done.
UPDATE finance.inbox_entries
SET resolution = %(resolution)s, resolved_at = now()
WHERE transaction_id = %(transaction_id)s AND kind = 'place' AND resolution IS NULL
