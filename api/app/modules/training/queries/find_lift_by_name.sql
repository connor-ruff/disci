SELECT id FROM training.lifts
WHERE lower(name) = lower(%(name)s) AND deleted_at IS NULL
