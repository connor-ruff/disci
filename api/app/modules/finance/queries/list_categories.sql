SELECT id, kind, name, description, color, icon, sort_order, is_default
FROM finance.budget_categories
WHERE deleted_at IS NULL
ORDER BY kind, sort_order, lower(name)
