SELECT id, name, sort_order
FROM shopping.shopping_types
WHERE id = %(type_id)s AND deleted_at IS NULL
