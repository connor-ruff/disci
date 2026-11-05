-- Locks the workout so concurrent edits of its sets apply one after the other.
SELECT id, type FROM training.workouts
WHERE id = %(workout_id)s AND deleted_at IS NULL
FOR UPDATE
