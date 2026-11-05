-- A workout's sets are replaced as a whole on edit (hard delete; see docs/db/training.md).
DELETE FROM training.lift_sets WHERE workout_id = %(workout_id)s
