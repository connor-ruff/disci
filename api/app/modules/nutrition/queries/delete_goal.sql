UPDATE nutrition.macro_goals
SET deleted_at = now()
WHERE id = %(goal_id)s
