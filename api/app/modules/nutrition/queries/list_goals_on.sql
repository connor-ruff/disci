-- Goals in effect on a day.
SELECT id, nutrient, kind, amount, starts_on, ends_on
FROM nutrition.macro_goals
WHERE deleted_at IS NULL
  AND starts_on <= %(day)s AND (ends_on IS NULL OR ends_on >= %(day)s)
ORDER BY kind DESC, nutrient
