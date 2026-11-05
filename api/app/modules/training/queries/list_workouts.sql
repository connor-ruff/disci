-- Newest first. Every filter is optional (null = no filter).
SELECT id, type, date, location, miles, time_in_sec, elevation_gain_ft, avg_heart_rate,
       description, reflection, created_at
FROM training.workouts
WHERE deleted_at IS NULL
  AND (%(date_from)s::date IS NULL OR date >= %(date_from)s::date)
  AND (%(date_to)s::date IS NULL OR date <= %(date_to)s::date)
  AND (%(type)s::text IS NULL OR type = %(type)s::text)
ORDER BY date DESC, created_at DESC
LIMIT %(limit)s OFFSET %(offset)s
