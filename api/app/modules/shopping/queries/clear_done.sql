-- Removes crossed-off items: every type's, or one type's (null = Uncategorized).
DELETE FROM shopping.list_items
WHERE done_at IS NOT NULL
  AND (%(all_types)s OR shopping_type_id IS NOT DISTINCT FROM %(shopping_type_id)s)
RETURNING id
