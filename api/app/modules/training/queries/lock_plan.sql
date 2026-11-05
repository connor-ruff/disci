-- Locks the plan so concurrent edits of its days apply one after the other.
SELECT id FROM training.plans
WHERE id = %(plan_id)s AND deleted_at IS NULL
FOR UPDATE
