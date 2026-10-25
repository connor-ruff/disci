UPDATE core.users
SET display_name   = %(display_name)s,
    timezone       = %(timezone)s,
    week_starts_on = %(week_starts_on)s
WHERE id = %(user_id)s
  AND deleted_at IS NULL
RETURNING id, email, display_name, timezone, week_starts_on
