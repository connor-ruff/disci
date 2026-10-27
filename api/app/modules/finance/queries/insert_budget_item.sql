INSERT INTO finance.budget_items
    (user_id, budget_id, kind, name, category_id, planned_amount, is_checklist_item, checklist_day,
     checklist_mode, sort_order)
SELECT %(user_id)s, %(budget_id)s, %(kind)s, %(name)s, %(category_id)s, %(planned_amount)s,
       %(is_checklist_item)s, %(checklist_day)s, %(checklist_mode)s, coalesce(max(sort_order), 0) + 1
FROM finance.budget_items
WHERE budget_id = %(budget_id)s AND deleted_at IS NULL
RETURNING id
