-- A recurring rule's item in one budget: same kind, same name (ignoring case and extra
-- spaces) and same category (Uncategorized matches Uncategorized).
SELECT id
FROM finance.budget_items
WHERE budget_id = %(budget_id)s AND kind = %(kind)s AND deleted_at IS NULL
  AND lower(regexp_replace(trim(name), '\s+', ' ', 'g'))
      = lower(regexp_replace(trim(%(name)s), '\s+', ' ', 'g'))
  AND category_id IS NOT DISTINCT FROM %(category_id)s::uuid
ORDER BY created_at
LIMIT 1
