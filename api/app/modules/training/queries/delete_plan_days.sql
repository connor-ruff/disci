-- Days are replaced, not edited in place (hard delete; see docs/db/training.md).
DELETE FROM training.plan_days
WHERE plan_id = %(plan_id)s
  AND (%(date_from)s::date IS NULL OR day_on >= %(date_from)s::date)
  AND (%(date_to)s::date IS NULL OR day_on <= %(date_to)s::date)
