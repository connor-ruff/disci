-- An item with this name (any case) in this type that isn't crossed off yet.
SELECT id, shopping_type_id, name, notes, sort_order, done_at
FROM shopping.list_items
WHERE shopping_type_id IS NOT DISTINCT FROM %(shopping_type_id)s
  AND lower(name) = lower(%(name)s)
  AND done_at IS NULL
ORDER BY created_at
LIMIT 1
