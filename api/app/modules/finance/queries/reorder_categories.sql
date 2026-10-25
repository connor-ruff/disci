-- Sets sort_order to each id's position in the list (within one kind).
UPDATE finance.budget_categories c
SET sort_order = o.position
FROM unnest(%(ids)s::uuid[]) WITH ORDINALITY AS o (id, position)
WHERE c.id = o.id AND c.kind = %(kind)s AND c.deleted_at IS NULL
