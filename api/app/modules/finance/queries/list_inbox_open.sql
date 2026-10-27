-- Inbox entries waiting on the user, oldest transaction first, with their transaction and
-- the rule's intended item. Entries whose transaction or budget was deleted drop out.
SELECT
    e.id, e.kind AS entry_kind, e.created_at, e.seen_at IS NOT NULL AS seen,
    e.budget_id, b.name AS budget_name, e.budget_item_id, i.name AS budget_item_name,
    t.id AS transaction_id, t.kind, t.amount, t.occurred_on, t.payee, t.description, t.notes,
    t.status, t.recurring_transaction_id,
    r.name AS recurring_name, r.item_name, r.category_id, c.name AS category_name
FROM finance.inbox_entries e
JOIN finance.transactions t ON t.id = e.transaction_id AND t.deleted_at IS NULL
LEFT JOIN finance.recurring_transactions r ON r.id = t.recurring_transaction_id
LEFT JOIN finance.budget_categories c ON c.id = r.category_id AND c.deleted_at IS NULL
LEFT JOIN finance.budgets b ON b.id = e.budget_id
LEFT JOIN finance.budget_items i ON i.id = e.budget_item_id
WHERE e.kind <> 'applied' AND e.resolution IS NULL AND (b.id IS NULL OR b.deleted_at IS NULL)
ORDER BY t.occurred_on, e.created_at
