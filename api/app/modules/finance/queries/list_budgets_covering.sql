SELECT id, period_start, period_end
FROM finance.budgets
WHERE deleted_at IS NULL AND %(day)s BETWEEN period_start AND period_end
