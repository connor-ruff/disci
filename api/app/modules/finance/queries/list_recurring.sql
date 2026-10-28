SELECT r.id, r.kind, r.name, r.item_name, r.category_id, c.name AS category_name, r.amount,
       r.payee, r.notes, r.frequency, r.day_of_week, r.day_of_month, r.starts_on, r.ends_on,
       r.auto_apply,
       r.paused_at IS NOT NULL AS paused
FROM finance.recurring_transactions r
LEFT JOIN finance.budget_categories c ON c.id = r.category_id AND c.deleted_at IS NULL
WHERE r.deleted_at IS NULL
ORDER BY r.kind DESC, lower(r.name)
