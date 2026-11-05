-- A plan's days, in order. Optional date range (null = no bound).
SELECT day_on, planned_miles, notes
FROM training.plan_days
WHERE plan_id = %(plan_id)s
  AND (%(date_from)s::date IS NULL OR day_on >= %(date_from)s::date)
  AND (%(date_to)s::date IS NULL OR day_on <= %(date_to)s::date)
ORDER BY day_on
