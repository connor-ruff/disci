SELECT id, shopping_type_id, name, notes, sort_order, done_at
FROM shopping.list_items
ORDER BY sort_order, created_at
