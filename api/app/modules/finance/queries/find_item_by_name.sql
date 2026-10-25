SELECT id
FROM finance.budget_items
WHERE budget_id = %(budget_id)s AND kind = %(kind)s AND lower(name) = lower(%(name)s)
  AND deleted_at IS NULL
ORDER BY created_at
LIMIT 1
