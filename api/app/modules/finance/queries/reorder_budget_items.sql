-- Sets sort_order to each id's position in the list (items of one budget).
UPDATE finance.budget_items i
SET sort_order = o.position
FROM unnest(%(ids)s::uuid[]) WITH ORDINALITY AS o (id, position)
WHERE i.id = o.id AND i.budget_id = %(budget_id)s AND i.deleted_at IS NULL
