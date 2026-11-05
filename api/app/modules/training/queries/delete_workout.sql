-- Soft delete. Its lift sets stay, hidden with it.
UPDATE training.workouts
SET deleted_at = now()
WHERE id = %(workout_id)s AND deleted_at IS NULL
RETURNING id
