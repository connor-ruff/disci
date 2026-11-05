-- The sets of the given workouts, in order. A deleted lift still shows its name.
SELECT s.workout_id, s.set_number, s.lift_id, l.name AS lift_name, s.reps, s.weight_num
FROM training.lift_sets s
JOIN training.lifts l ON l.id = s.lift_id
WHERE s.workout_id = ANY(%(workout_ids)s)
ORDER BY s.workout_id, s.set_number
