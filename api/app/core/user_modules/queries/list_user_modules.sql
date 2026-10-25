SELECT module_key, disabled_at
FROM core.user_modules
WHERE user_id = %(user_id)s
  AND deleted_at IS NULL
