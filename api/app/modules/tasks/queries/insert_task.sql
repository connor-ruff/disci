INSERT INTO tasks.tasks
    (user_id, task_type, name, description, repeat_every, repeat_unit, next_due, daily_target)
VALUES
    (%(user_id)s, %(task_type)s, %(name)s, %(description)s, %(repeat_every)s, %(repeat_unit)s,
     %(next_due)s, %(daily_target)s)
RETURNING id
