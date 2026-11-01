SELECT id, shopping_type_id, name, notes, sort_order, done_at
FROM shopping.list_items
WHERE id = %(item_id)s
