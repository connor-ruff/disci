INSERT INTO finance.budget_categories (user_id, kind, name, description, sort_order)
SELECT %(user_id)s, %(kind)s, %(name)s, %(description)s, coalesce(max(sort_order), 0) + 1
FROM finance.budget_categories
WHERE kind = %(kind)s AND deleted_at IS NULL
RETURNING id, kind, name, description, color, icon, sort_order, is_default
