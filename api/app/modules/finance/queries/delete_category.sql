UPDATE finance.budget_categories
SET deleted_at = now()
WHERE id = %(category_id)s AND deleted_at IS NULL
RETURNING id
