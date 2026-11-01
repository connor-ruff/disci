INSERT INTO shopping.shopping_types (user_id, name, sort_order)
SELECT %(user_id)s, name, ord
FROM unnest(%(names)s::text[]) WITH ORDINALITY AS t (name, ord)
ON CONFLICT DO NOTHING
