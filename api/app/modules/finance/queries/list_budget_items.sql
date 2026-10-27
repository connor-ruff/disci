-- Items with their net actual (confirmed transactions only): allocated transactions of
-- the item's own kind add, the opposite kind subtracts (a rebate reduces Groceries).
-- Pending (awaiting approval) amounts are reported separately. A checklist item is done
-- once something has been logged and, in full_amount mode, its actual reaches the plan.
SELECT *, (is_checklist_item AND actual_amount > 0
           AND (checklist_mode = 'any_payment' OR actual_amount >= planned_amount))
              AS checklist_done
FROM (
    SELECT
        i.id, i.kind, i.name, i.category_id, c.name AS category_name, i.planned_amount,
        coalesce(
            sum(CASE WHEN t.kind = i.kind THEN a.amount ELSE -a.amount END)
                FILTER (WHERE t.status = 'confirmed'),
            0
        )::numeric(12,2) AS actual_amount,
        coalesce(
            sum(CASE WHEN t.kind = i.kind THEN a.amount ELSE -a.amount END)
                FILTER (WHERE t.status = 'pending'),
            0
        )::numeric(12,2) AS pending_amount,
        i.is_checklist_item, i.checklist_day, i.checklist_mode, i.sort_order,
        c.sort_order AS category_sort, lower(c.name) AS category_key, i.created_at
    FROM finance.budget_items i
    LEFT JOIN finance.budget_categories c ON c.id = i.category_id AND c.deleted_at IS NULL
    LEFT JOIN finance.transaction_allocations a ON a.budget_item_id = i.id
    LEFT JOIN finance.transactions t ON t.id = a.transaction_id AND t.deleted_at IS NULL
    WHERE i.budget_id = %(budget_id)s AND i.deleted_at IS NULL
    GROUP BY i.id, c.name, c.sort_order
) items
ORDER BY kind DESC, category_sort NULLS LAST, category_key, sort_order, created_at
