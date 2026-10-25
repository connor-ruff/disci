SELECT t.id, t.kind, t.amount, t.occurred_on, t.payee, t.description, t.notes, t.status,
       t.recurring_transaction_id, r.name AS recurring_name
FROM finance.transactions t
LEFT JOIN finance.recurring_transactions r ON r.id = t.recurring_transaction_id
WHERE t.status = 'pending' AND t.deleted_at IS NULL
ORDER BY t.occurred_on, t.created_at
