-- Everything but the type, which a task keeps for life.
UPDATE tasks.tasks
SET name = %(name)s, description = %(description)s, repeat_every = %(repeat_every)s,
    repeat_unit = %(repeat_unit)s, next_due = %(next_due)s, daily_target = %(daily_target)s
WHERE id = %(task_id)s AND deleted_at IS NULL
RETURNING id
