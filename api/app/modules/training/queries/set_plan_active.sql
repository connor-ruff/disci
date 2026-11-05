UPDATE training.plans
SET is_active = %(active)s
WHERE id = %(plan_id)s AND deleted_at IS NULL
RETURNING id
