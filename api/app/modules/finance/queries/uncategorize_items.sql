-- Things in a deleted category become Uncategorized: budget items, and recurring rules
-- (so they don't keep creating new items in the deleted category).
WITH items AS (
    UPDATE finance.budget_items
    SET category_id = NULL
    WHERE category_id = %(category_id)s
)
UPDATE finance.recurring_transactions
SET category_id = NULL
WHERE category_id = %(category_id)s
