-- Everything checked off on a day (deleted tasks included: it still happened).
SELECT c.id, c.task_id, t.name AS task_name, t.task_type, c.completed_on, c.due_on,
       c.created_at
FROM tasks.task_completions c
JOIN tasks.tasks t ON t.id = c.task_id
WHERE c.completed_on = %(day)s AND c.deleted_at IS NULL
ORDER BY c.created_at
