-- Moving an item to another type puts it at the end of that type.
UPDATE shopping.list_items i
SET name = %(name)s,
    notes = %(notes)s,
    shopping_type_id = %(shopping_type_id)s,
    sort_order = CASE
        WHEN i.shopping_type_id IS NOT DISTINCT FROM %(shopping_type_id)s THEN i.sort_order
        ELSE (SELECT coalesce(max(sort_order), 0) + 1 FROM shopping.list_items
              WHERE shopping_type_id IS NOT DISTINCT FROM %(shopping_type_id)s)
    END
WHERE i.id = %(item_id)s
RETURNING id, shopping_type_id, name, notes, sort_order, done_at
