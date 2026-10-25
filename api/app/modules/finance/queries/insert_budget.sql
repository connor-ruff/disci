INSERT INTO finance.budgets (user_id, name, period_type, period_start, period_end)
VALUES (%(user_id)s, %(name)s, %(period_type)s, %(period_start)s, %(period_end)s)
RETURNING id, name, period_type, period_start, period_end, notes
