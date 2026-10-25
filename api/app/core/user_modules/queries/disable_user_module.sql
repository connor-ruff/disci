UPDATE core.user_modules
SET disabled_at = now()
WHERE user_id = %(user_id)s
  AND module_key = %(module_key)s
  AND disabled_at IS NULL
  AND deleted_at IS NULL
