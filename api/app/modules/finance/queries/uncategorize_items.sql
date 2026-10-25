-- Items in a deleted category become Uncategorized.
UPDATE finance.budget_items
SET category_id = NULL
WHERE category_id = %(category_id)s
