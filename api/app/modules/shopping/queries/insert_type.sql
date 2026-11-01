-- New types go last.
INSERT INTO shopping.shopping_types (user_id, name, sort_order)
SELECT %(user_id)s, %(name)s, coalesce(max(sort_order), 0) + 1
FROM shopping.shopping_types
WHERE deleted_at IS NULL
RETURNING id, name, sort_order
