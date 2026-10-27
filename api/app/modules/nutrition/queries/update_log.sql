-- Repo entries only; quick adds are edited with update_quick_log.
UPDATE nutrition.food_item_logs
SET eaten_on = %(eaten_on)s, servings = %(servings)s, notes = %(notes)s
WHERE id = %(log_id)s AND food_item_id IS NOT NULL AND deleted_at IS NULL
RETURNING id
