-- Items with their net actual: allocated transactions of the item's own kind add,
-- the opposite kind subtracts (a grocery rebate reduces Groceries).
SELECT
    i.id, i.kind, i.name, i.category_id, c.name AS category_name, i.planned_amount,
    coalesce(
        sum(CASE WHEN t.kind = i.kind THEN a.amount ELSE -a.amount END)
            FILTER (WHERE t.id IS NOT NULL),
        0
    )::numeric(12,2) AS actual_amount,
    i.sort_order
FROM finance.budget_items i
LEFT JOIN finance.budget_categories c ON c.id = i.category_id AND c.deleted_at IS NULL
LEFT JOIN finance.transaction_allocations a ON a.budget_item_id = i.id
LEFT JOIN finance.transactions t ON t.id = a.transaction_id AND t.deleted_at IS NULL
WHERE i.budget_id = %(budget_id)s AND i.deleted_at IS NULL
GROUP BY i.id, c.name, c.sort_order
ORDER BY i.kind DESC, c.sort_order NULLS LAST, lower(c.name), i.sort_order, i.created_at
