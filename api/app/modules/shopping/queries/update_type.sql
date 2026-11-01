UPDATE shopping.shopping_types
SET name = %(name)s
WHERE id = %(type_id)s AND deleted_at IS NULL
RETURNING id, name, sort_order
