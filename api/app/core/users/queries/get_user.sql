SELECT id, email, display_name, timezone, week_starts_on
FROM core.users
WHERE id = %(user_id)s
  AND deleted_at IS NULL
