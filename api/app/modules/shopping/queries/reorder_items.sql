-- Sets sort_order to each id's position in the list.
UPDATE shopping.list_items i
SET sort_order = o.position
FROM unnest(%(ids)s::uuid[]) WITH ORDINALITY AS o (id, position)
WHERE i.id = o.id
