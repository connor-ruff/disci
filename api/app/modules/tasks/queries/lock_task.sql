-- The task's definition, locked so concurrent check-offs apply one after the other.
SELECT id, task_type, repeat_every, repeat_unit, next_due
FROM tasks.tasks
WHERE id = %(task_id)s AND deleted_at IS NULL
FOR UPDATE
