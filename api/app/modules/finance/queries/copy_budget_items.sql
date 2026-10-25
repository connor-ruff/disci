-- Copies a budget's items (not its transactions) into a new budget. Items whose
-- category has since been deleted come across Uncategorized.
INSERT INTO finance.budget_items
    (user_id, budget_id, kind, category_id, name, planned_amount, sort_order, notes)
SELECT %(user_id)s, %(budget_id)s, i.kind, c.id, i.name, i.planned_amount, i.sort_order, i.notes
FROM finance.budget_items i
LEFT JOIN finance.budget_categories c ON c.id = i.category_id AND c.deleted_at IS NULL
WHERE i.budget_id = %(source_budget_id)s AND i.deleted_at IS NULL
