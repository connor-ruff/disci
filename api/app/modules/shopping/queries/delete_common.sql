UPDATE shopping.common_items
SET deleted_at = now()
WHERE id = %(common_id)s AND deleted_at IS NULL
RETURNING id
