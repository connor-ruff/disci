SELECT i.id, i.budget_id, i.kind, b.period_type
FROM finance.budget_items i
JOIN finance.budgets b ON b.id = i.budget_id
WHERE i.id = %(item_id)s AND i.deleted_at IS NULL
