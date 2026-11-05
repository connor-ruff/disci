UPDATE training.lifts
SET name = %(name)s, description = %(description)s
WHERE id = %(lift_id)s AND deleted_at IS NULL
RETURNING id
