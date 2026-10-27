INSERT INTO tasks.task_completions (user_id, task_id, completed_on, due_on)
VALUES (%(user_id)s, %(task_id)s, %(completed_on)s, %(due_on)s)
