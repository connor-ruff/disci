-- Soft-deletes the budget and its items, and drops their allocations, so the
-- transactions return to the unassigned inbox.
WITH budget AS (
    UPDATE finance.budgets SET deleted_at = now()
    WHERE id = %(budget_id)s AND deleted_at IS NULL
    RETURNING id
), items AS (
    UPDATE finance.budget_items SET deleted_at = now()
    WHERE budget_id IN (SELECT id FROM budget) AND deleted_at IS NULL
    RETURNING id
), allocations AS (
    DELETE FROM finance.transaction_allocations
    WHERE budget_item_id IN (SELECT id FROM items)
)
SELECT id FROM budget
