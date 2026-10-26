-- Soft delete: days that logged it keep showing it.
UPDATE nutrition.food_items
SET deleted_at = now()
WHERE id = %(food_id)s AND deleted_at IS NULL
RETURNING id
