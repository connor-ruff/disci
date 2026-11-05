DELETE FROM training.plan_weeks
WHERE plan_id = %(plan_id)s
  AND (%(date_from)s::date IS NULL OR week_starts_on >= %(date_from)s::date)
  AND (%(date_to)s::date IS NULL OR week_starts_on <= %(date_to)s::date)
