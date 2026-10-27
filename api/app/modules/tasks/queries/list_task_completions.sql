-- A task's recent check-offs, newest first.
SELECT id, completed_on, due_on, created_at
FROM tasks.task_completions
WHERE task_id = %(task_id)s AND deleted_at IS NULL
ORDER BY completed_on DESC, created_at DESC
LIMIT %(limit)s
