-- Checklist items in the user's monthly budget(s) covering today. Done = a confirmed
-- transaction marked "satisfies checklist" is allocated to the item.
SELECT
    b.id AS budget_id, b.name AS budget_name, i.id AS item_id, i.name AS item_name, i.kind,
    i.checklist_day, i.planned_amount,
    (b.period_start + (i.checklist_day - 1))::date AS due_on,
    min(t.occurred_on) FILTER (WHERE t.satisfies_checklist AND t.status = 'confirmed') AS done_on
FROM finance.budgets b
JOIN finance.budget_items i ON i.budget_id = b.id AND i.deleted_at IS NULL AND i.is_checklist_item
LEFT JOIN finance.transaction_allocations a ON a.budget_item_id = i.id
LEFT JOIN finance.transactions t ON t.id = a.transaction_id AND t.deleted_at IS NULL
WHERE b.deleted_at IS NULL AND b.period_type = 'month'
  AND %(today)s BETWEEN b.period_start AND b.period_end
GROUP BY b.id, i.id
ORDER BY i.checklist_day, lower(i.name)
