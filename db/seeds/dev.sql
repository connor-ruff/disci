-- Fake data for LOCAL DEVELOPMENT ONLY. Never run against production.
-- Safe to re-run: every insert skips rows that already exist.

-- A stand-in user for working on the API before Cognito login is wired up.
-- Signing in through Cognito creates your real user row separately.
INSERT INTO core.users (cognito_sub, email, display_name, timezone)
VALUES ('local-dev-user', 'local-dev-user@disci.local', 'Local Dev', 'America/Chicago')
ON CONFLICT (cognito_sub) WHERE deleted_at IS NULL DO NOTHING;

INSERT INTO core.user_modules (user_id, module_key)
SELECT id, 'finance' FROM core.users WHERE cognito_sub = 'local-dev-user'
ON CONFLICT (user_id, module_key) WHERE deleted_at IS NULL DO NOTHING;

-- Finance: the default expense categories (what enabling the module does), plus one
-- custom income category.
INSERT INTO finance.budget_categories (user_id, kind, name, sort_order, is_default)
SELECT u.id, 'expense', c.name, c.ord, true
FROM core.users u,
     unnest(ARRAY['Housing', 'Insurance', 'Utilities', 'Transportation', 'Debts',
                  'Savings', 'Food', 'Personal', 'Health']) WITH ORDINALITY AS c (name, ord)
WHERE u.cognito_sub = 'local-dev-user'
ON CONFLICT DO NOTHING;

INSERT INTO finance.budget_categories (user_id, kind, name, sort_order)
SELECT id, 'income', 'Salary', 1 FROM core.users WHERE cognito_sub = 'local-dev-user'
ON CONFLICT DO NOTHING;

-- A budget for the current month with a few items and transactions (once).
DO $$
DECLARE
    v_user   uuid := (SELECT id FROM core.users WHERE cognito_sub = 'local-dev-user');
    v_start  date := date_trunc('month', current_date)::date;
    v_budget uuid;
    v_item   uuid;
    v_txn    uuid;
    cat      text;
BEGIN
    IF EXISTS (SELECT FROM finance.budgets WHERE user_id = v_user AND period_start = v_start) THEN
        RETURN;
    END IF;

    INSERT INTO finance.budgets (user_id, name, period_type, period_start, period_end)
    VALUES (v_user, to_char(v_start, 'FMMonth YYYY'), 'month', v_start,
            (v_start + interval '1 month - 1 day')::date)
    RETURNING id INTO v_budget;

    -- (kind, category, name, planned, [actual transactions: kind:amount ...])
    FOR cat IN SELECT unnest(ARRAY[
        'income|Salary|Paycheck|4200|income:2100,income:2100',
        'income||Side gig|300|income:120',
        'expense|Housing|Rent|1650|expense:1650',
        'expense|Utilities|Electric|90|expense:84.17',
        'expense|Food|Groceries|450|expense:212.40,expense:96.15,income:25',
        'expense|Food|Uber Eats|120|expense:38.50',
        'expense|Transportation|Gas|160|expense:52.30',
        'expense|Savings|Emergency fund|500|',
        'expense||Birthday gift|60|'
    ]) LOOP
        INSERT INTO finance.budget_items (user_id, budget_id, kind, category_id, name, planned_amount)
        VALUES (
            v_user, v_budget, split_part(cat, '|', 1),
            (SELECT id FROM finance.budget_categories
             WHERE user_id = v_user AND kind = split_part(cat, '|', 1)
               AND name = nullif(split_part(cat, '|', 2), '') AND deleted_at IS NULL),
            split_part(cat, '|', 3), split_part(cat, '|', 4)::numeric
        )
        RETURNING id INTO v_item;

        IF split_part(cat, '|', 5) <> '' THEN
            FOR i IN 1 .. array_length(string_to_array(split_part(cat, '|', 5), ','), 1) LOOP
                INSERT INTO finance.transactions (user_id, kind, amount, occurred_on, payee)
                VALUES (
                    v_user,
                    split_part((string_to_array(split_part(cat, '|', 5), ','))[i], ':', 1),
                    split_part((string_to_array(split_part(cat, '|', 5), ','))[i], ':', 2)::numeric,
                    least(v_start + (i * 7), current_date),
                    split_part(cat, '|', 3)
                )
                RETURNING id INTO v_txn;
                INSERT INTO finance.transaction_allocations (user_id, transaction_id, budget_item_id, amount)
                SELECT v_user, v_txn, v_item, amount FROM finance.transactions WHERE id = v_txn;
            END LOOP;
        END IF;
    END LOOP;
END
$$;
