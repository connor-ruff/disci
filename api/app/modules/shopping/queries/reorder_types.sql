-- Sets sort_order to each id's position in the list.
UPDATE shopping.shopping_types t
SET sort_order = o.position
FROM unnest(%(ids)s::uuid[]) WITH ORDINALITY AS o (id, position)
WHERE t.id = o.id AND t.deleted_at IS NULL
