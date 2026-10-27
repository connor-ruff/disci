-- Active tasks with their progress as of %(day)s: check-offs that day, and the last day
-- each was done. Ad-hoc to-dos finished before that day are left out (done is done), but
-- one finished that day stays, crossed off, until the day ends.
SELECT t.id, t.task_type, t.name, t.description, t.repeat_every, t.repeat_unit, t.next_due,
       t.daily_target, coalesce(c.done_on_day, 0) AS done_on_day, c.last_done_on
FROM tasks.tasks t
LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE completed_on = %(day)s)::int AS done_on_day,
           max(completed_on) AS last_done_on
    FROM tasks.task_completions
    WHERE task_id = t.id AND deleted_at IS NULL
) c ON true
WHERE t.deleted_at IS NULL
  AND (t.task_type <> 'adhoc_to_do' OR c.last_done_on IS NULL OR c.last_done_on >= %(day)s)
ORDER BY t.next_due NULLS LAST, lower(t.name)
