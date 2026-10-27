-- The most recent check-off of a task, optionally only one on a given day.
SELECT id, completed_on, due_on
FROM tasks.task_completions
WHERE task_id = %(task_id)s AND deleted_at IS NULL
  AND (%(day)s::date IS NULL OR completed_on = %(day)s)
ORDER BY completed_on DESC, created_at DESC
LIMIT 1
