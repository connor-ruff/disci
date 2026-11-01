UPDATE shopping.shopping_types
SET deleted_at = now()
WHERE id = %(type_id)s AND deleted_at IS NULL
RETURNING id
