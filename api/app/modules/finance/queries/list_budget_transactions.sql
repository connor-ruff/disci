-- Transactions as they count toward one budget: one row per allocation, so a
-- transaction split across two items in this budget appears twice.
SELECT
    t.id, t.kind, t.amount, t.occurred_on, t.payee, t.description, t.notes, t.status,
    t.recurring_transaction_id,
    i.id AS budget_item_id, i.name AS budget_item_name, a.amount AS allocated_amount
FROM finance.transaction_allocations a
JOIN finance.budget_items i ON i.id = a.budget_item_id AND i.deleted_at IS NULL
JOIN finance.transactions t ON t.id = a.transaction_id AND t.deleted_at IS NULL
WHERE i.budget_id = %(budget_id)s
ORDER BY t.occurred_on DESC, t.created_at DESC
