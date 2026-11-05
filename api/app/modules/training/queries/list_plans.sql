-- Plans with their totals: the active one first, then newest first. %(plan_id)s narrows
-- it to one plan; %(active_only)s to the active one.
SELECT p.id, p.name, p.race_name, p.race_on, p.starts_on, p.is_active, p.count_walk_miles,
       p.cross_train_at_pct,
       coalesce(p.race_on, max(d.day_on)) AS ends_on,
       coalesce(sum(d.planned_miles), 0) AS total_miles,
       count(d.id) AS day_count
FROM training.plans p
LEFT JOIN training.plan_days d ON d.plan_id = p.id
WHERE p.deleted_at IS NULL
  AND (%(plan_id)s::uuid IS NULL OR p.id = %(plan_id)s::uuid)
  AND (NOT %(active_only)s OR p.is_active)
GROUP BY p.id
ORDER BY p.is_active DESC, p.starts_on DESC, p.created_at DESC
