-- migrate:up

-- One-time backfill: users who turned Finance on before the finance module existed never
-- ran its first-enable setup, so they have no categories. Give them the defaults (same
-- list as DEFAULT_EXPENSE_CATEGORIES in api/app/modules/finance/service.py).
-- Only touches users with Finance enabled and no category rows at all, deleted or not,
-- so it never re-adds categories someone removed on purpose.

INSERT INTO finance.budget_categories (user_id, kind, name, sort_order, is_default)
SELECT m.user_id, 'expense', c.name, c.ord, true
FROM core.user_modules m
CROSS JOIN unnest(ARRAY['Housing', 'Insurance', 'Utilities', 'Transportation', 'Debts',
                        'Savings', 'Food', 'Personal', 'Health'])
    WITH ORDINALITY AS c (name, ord)
WHERE m.module_key = 'finance'
  AND m.deleted_at IS NULL
  AND NOT EXISTS (SELECT FROM finance.budget_categories bc WHERE bc.user_id = m.user_id);

-- migrate:down

-- Data backfill; nothing to undo (the categories are ordinary user data from here on).
