SELECT id, name, sort_order
FROM shopping.shopping_types
WHERE deleted_at IS NULL
ORDER BY sort_order, lower(name)
