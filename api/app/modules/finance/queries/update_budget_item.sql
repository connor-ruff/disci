UPDATE finance.budget_items
SET name = %(name)s, category_id = %(category_id)s, planned_amount = %(planned_amount)s
WHERE id = %(item_id)s AND deleted_at IS NULL
RETURNING id
