SELECT id, name, period_type, period_start, period_end, notes
FROM finance.budgets
WHERE deleted_at IS NULL
ORDER BY period_start DESC, created_at DESC
