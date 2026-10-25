-- Where one transaction counts: each allocation with its item and budget.
SELECT
    a.budget_item_id, i.name AS budget_item_name, i.kind AS budget_item_kind,
    b.id AS budget_id, b.name AS budget_name, a.amount
FROM finance.transaction_allocations a
JOIN finance.budget_items i ON i.id = a.budget_item_id AND i.deleted_at IS NULL
JOIN finance.budgets b ON b.id = i.budget_id AND b.deleted_at IS NULL
WHERE a.transaction_id = %(transaction_id)s
ORDER BY b.period_start, b.name, i.name
