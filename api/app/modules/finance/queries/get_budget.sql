SELECT id, name, period_type, period_start, period_end, notes
FROM finance.budgets
WHERE id = %(budget_id)s AND deleted_at IS NULL
