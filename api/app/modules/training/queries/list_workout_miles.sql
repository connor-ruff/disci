-- What the calendar scores weeks with: each workout's day, type and miles.
SELECT date, type, miles
FROM training.workouts
WHERE deleted_at IS NULL AND date BETWEEN %(date_from)s AND %(date_to)s
