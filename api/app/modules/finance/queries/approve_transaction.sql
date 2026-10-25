-- Confirms a pending transaction, optionally with a corrected amount. Generated
-- transactions are allocated in full to each budget, so allocations follow the amount.
WITH txn AS (
    UPDATE finance.transactions
    SET status = 'confirmed', amount = coalesce(%(amount)s, amount)
    WHERE id = %(transaction_id)s AND status = 'pending' AND deleted_at IS NULL
    RETURNING id, kind, amount, occurred_on, payee, description, notes, status, recurring_transaction_id
), allocations AS (
    UPDATE finance.transaction_allocations a
    SET amount = txn.amount
    FROM txn
    WHERE a.transaction_id = txn.id
)
SELECT * FROM txn
