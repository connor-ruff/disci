-- One task with its progress as of %(day)s (see list_tasks.sql).
SELECT t.id, t.task_type, t.name, t.description, t.repeat_every, t.repeat_unit, t.next_due,
       t.daily_target, coalesce(c.done_on_day, 0) AS done_on_day, c.last_done_on
FROM tasks.tasks t
LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE completed_on = %(day)s)::int AS done_on_day,
           max(completed_on) AS last_done_on
    FROM tasks.task_completions
    WHERE task_id = t.id AND deleted_at IS NULL
) c ON true
WHERE t.id = %(task_id)s AND t.deleted_at IS NULL
