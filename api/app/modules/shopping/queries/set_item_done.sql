-- Crossing off keeps the first time it was crossed off.
UPDATE shopping.list_items
SET done_at = CASE WHEN %(done)s THEN coalesce(done_at, now()) END
WHERE id = %(item_id)s
RETURNING id, shopping_type_id, name, notes, sort_order, done_at
