UPDATE finance.budget_categories
SET name = %(name)s
WHERE id = %(category_id)s AND deleted_at IS NULL
RETURNING id, kind, name, color, icon, sort_order, is_default
