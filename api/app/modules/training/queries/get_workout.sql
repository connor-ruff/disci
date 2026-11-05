SELECT id, type, date, location, miles, time_in_sec, elevation_gain_ft, avg_heart_rate,
       description, reflection, created_at
FROM training.workouts
WHERE id = %(workout_id)s AND deleted_at IS NULL
