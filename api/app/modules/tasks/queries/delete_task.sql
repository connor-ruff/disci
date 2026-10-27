-- Soft delete: its completions stay, for history.
UPDATE tasks.tasks
SET deleted_at = now()
WHERE id = %(task_id)s AND deleted_at IS NULL
RETURNING id
