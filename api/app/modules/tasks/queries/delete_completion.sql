UPDATE tasks.task_completions SET deleted_at = now() WHERE id = %(completion_id)s
