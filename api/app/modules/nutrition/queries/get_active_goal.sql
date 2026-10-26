SELECT id, nutrient, kind, amount, starts_on, ends_on
FROM nutrition.macro_goals
WHERE id = %(goal_id)s AND ends_on IS NULL AND deleted_at IS NULL
