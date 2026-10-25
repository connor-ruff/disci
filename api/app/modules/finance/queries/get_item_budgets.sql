SELECT id, budget_id
FROM finance.budget_items
WHERE id = ANY(%(item_ids)s) AND deleted_at IS NULL
