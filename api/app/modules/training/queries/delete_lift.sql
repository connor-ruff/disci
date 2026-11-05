-- Soft delete. Past sets keep pointing at it, so history still shows its name.
UPDATE training.lifts
SET deleted_at = now()
WHERE id = %(lift_id)s AND deleted_at IS NULL
RETURNING id
