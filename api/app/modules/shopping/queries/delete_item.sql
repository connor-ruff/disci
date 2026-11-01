-- Hard delete: a removed item isn't kept.
DELETE FROM shopping.list_items
WHERE id = %(item_id)s
RETURNING id
