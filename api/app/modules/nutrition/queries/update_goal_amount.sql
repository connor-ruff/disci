UPDATE nutrition.macro_goals
SET amount = %(amount)s
WHERE id = %(goal_id)s
RETURNING id, nutrient, kind, amount, starts_on, ends_on
