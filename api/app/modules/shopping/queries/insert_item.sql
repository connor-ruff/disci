-- New items go to the end of their type.
INSERT INTO shopping.list_items (user_id, shopping_type_id, name, notes, sort_order)
SELECT %(user_id)s, %(shopping_type_id)s, %(name)s, %(notes)s, coalesce(max(sort_order), 0) + 1
FROM shopping.list_items
WHERE shopping_type_id IS NOT DISTINCT FROM %(shopping_type_id)s
RETURNING id, shopping_type_id, name, notes, sort_order, done_at
