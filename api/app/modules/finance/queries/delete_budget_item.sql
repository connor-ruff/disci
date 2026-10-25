-- Soft-deletes the item and drops its allocations (those transactions become unassigned).
WITH item AS (
    UPDATE finance.budget_items SET deleted_at = now()
    WHERE id = %(item_id)s AND deleted_at IS NULL
    RETURNING id
), allocations AS (
    DELETE FROM finance.transaction_allocations
    WHERE budget_item_id IN (SELECT id FROM item)
)
SELECT id FROM item
