UPDATE core.user_modules
SET disabled_at = NULL,
    enabled_at  = now()
WHERE user_id = %(user_id)s
  AND module_key = %(module_key)s
  AND deleted_at IS NULL
