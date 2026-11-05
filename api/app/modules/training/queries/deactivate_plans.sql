-- Before another plan becomes active: at most one active plan per user.
UPDATE training.plans
SET is_active = false
WHERE is_active AND deleted_at IS NULL
