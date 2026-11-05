-- One lift's sets in each workout it was in, newest workout first.
SELECT w.id AS workout_id, w.date,
       json_agg(json_build_object('reps', s.reps, 'weight_num', s.weight_num::text)
                ORDER BY s.set_number) AS sets
FROM training.lift_sets s
JOIN training.workouts w ON w.id = s.workout_id AND w.deleted_at IS NULL
WHERE s.lift_id = %(lift_id)s
GROUP BY w.id, w.date, w.created_at
ORDER BY w.date DESC, w.created_at DESC
LIMIT %(limit)s
