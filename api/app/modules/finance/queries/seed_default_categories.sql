INSERT INTO finance.budget_categories (user_id, kind, name, sort_order, is_default)
SELECT %(user_id)s, 'expense', name, ord, true
FROM unnest(%(names)s::text[]) WITH ORDINALITY AS t (name, ord)
ON CONFLICT DO NOTHING
