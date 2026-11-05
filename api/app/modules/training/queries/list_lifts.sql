-- The catalog, most recently done first (never done: last, by name), with the sets from
-- the latest workout each lift was in ("last time"). %(lift_id)s narrows it to one lift.
WITH last_workout AS (
    SELECT DISTINCT ON (s.lift_id) s.lift_id, w.id AS workout_id, w.date
    FROM training.lift_sets s
    JOIN training.workouts w ON w.id = s.workout_id AND w.deleted_at IS NULL
    ORDER BY s.lift_id, w.date DESC, w.created_at DESC
)
SELECT l.id, l.name, l.description, lw.date AS last_done_on,
       coalesce(
           (SELECT json_agg(json_build_object('reps', s.reps, 'weight_num', s.weight_num::text)
                            ORDER BY s.set_number)
            FROM training.lift_sets s
            WHERE s.workout_id = lw.workout_id AND s.lift_id = l.id),
           '[]'::json
       ) AS last_sets
FROM training.lifts l
LEFT JOIN last_workout lw ON lw.lift_id = l.id
WHERE l.deleted_at IS NULL
  AND (%(lift_id)s::uuid IS NULL OR l.id = %(lift_id)s::uuid)
ORDER BY lw.date DESC NULLS LAST, lower(l.name)
