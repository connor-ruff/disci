WITH txn AS (
    UPDATE finance.transactions SET deleted_at = now()
    WHERE id = %(transaction_id)s AND deleted_at IS NULL
    RETURNING id
), allocations AS (
    DELETE FROM finance.transaction_allocations
    WHERE transaction_id IN (SELECT id FROM txn)
)
SELECT id FROM txn
