-- Things in a deleted type become Uncategorized: list items go to the end of it.
WITH common AS (
    UPDATE shopping.common_items
    SET shopping_type_id = NULL
    WHERE shopping_type_id = %(type_id)s
)
UPDATE shopping.list_items i
SET shopping_type_id = NULL,
    sort_order = i.sort_order + (
        SELECT coalesce(max(sort_order), 0) FROM shopping.list_items WHERE shopping_type_id IS NULL
    )
WHERE i.shopping_type_id = %(type_id)s
