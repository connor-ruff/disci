INSERT INTO training.workouts
    (user_id, type, date, location, miles, time_in_sec, elevation_gain_ft, avg_heart_rate,
     description, reflection)
VALUES
    (%(user_id)s, %(type)s, %(date)s, %(location)s, %(miles)s, %(time_in_sec)s,
     %(elevation_gain_ft)s, %(avg_heart_rate)s, %(description)s, %(reflection)s)
RETURNING id
