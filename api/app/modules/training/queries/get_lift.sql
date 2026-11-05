SELECT id, name, description FROM training.lifts
WHERE id = %(lift_id)s AND deleted_at IS NULL
