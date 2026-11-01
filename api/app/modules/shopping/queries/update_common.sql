UPDATE shopping.common_items
SET name = %(name)s, notes = %(notes)s, shopping_type_id = %(shopping_type_id)s
WHERE id = %(common_id)s AND deleted_at IS NULL
RETURNING id
