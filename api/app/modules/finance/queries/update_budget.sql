UPDATE finance.budgets
SET name = %(name)s, notes = %(notes)s
WHERE id = %(budget_id)s AND deleted_at IS NULL
RETURNING id, name, period_type, period_start, period_end, notes
