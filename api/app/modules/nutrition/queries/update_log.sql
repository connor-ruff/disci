UPDATE nutrition.food_item_logs
SET eaten_on = %(eaten_on)s, servings = %(servings)s, notes = %(notes)s
WHERE id = %(log_id)s AND deleted_at IS NULL
RETURNING id
