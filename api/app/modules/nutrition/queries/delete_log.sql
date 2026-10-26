UPDATE nutrition.food_item_logs
SET deleted_at = now()
WHERE id = %(log_id)s AND deleted_at IS NULL
RETURNING id
