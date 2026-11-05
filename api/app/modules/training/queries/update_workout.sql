UPDATE training.workouts
SET type = %(type)s,
    date = %(date)s,
    location = %(location)s,
    miles = %(miles)s,
    time_in_sec = %(time_in_sec)s,
    elevation_gain_ft = %(elevation_gain_ft)s,
    avg_heart_rate = %(avg_heart_rate)s,
    description = %(description)s,
    reflection = %(reflection)s
WHERE id = %(workout_id)s AND deleted_at IS NULL
RETURNING id
