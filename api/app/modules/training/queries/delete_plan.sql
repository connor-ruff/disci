-- Soft delete; a deleted plan is no longer active. Its days and weeks stay with it.
UPDATE training.plans
SET deleted_at = now(), is_active = false
WHERE id = %(plan_id)s AND deleted_at IS NULL
RETURNING id
