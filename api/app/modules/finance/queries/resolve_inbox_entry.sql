UPDATE finance.inbox_entries
SET resolution = %(resolution)s, resolved_at = now(),
    budget_item_id = coalesce(%(budget_item_id)s::uuid, budget_item_id)
WHERE id = %(entry_id)s AND kind <> 'applied' AND resolution IS NULL
RETURNING id
