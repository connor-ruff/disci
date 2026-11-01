SELECT c.id, c.shopping_type_id, c.name, c.notes,
       EXISTS (
           SELECT 1 FROM shopping.list_items i
           WHERE i.shopping_type_id IS NOT DISTINCT FROM c.shopping_type_id
             AND lower(i.name) = lower(c.name) AND i.done_at IS NULL
       ) AS on_list
FROM shopping.common_items c
WHERE c.id = %(common_id)s AND c.deleted_at IS NULL
