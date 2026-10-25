SELECT id, budget_id, kind
FROM finance.budget_items
WHERE id = %(item_id)s AND deleted_at IS NULL
