INSERT INTO nutrition.macro_goals (user_id, nutrient, kind, amount, starts_on)
VALUES (%(user_id)s, %(nutrient)s, %(kind)s, %(amount)s, %(starts_on)s)
RETURNING id, nutrient, kind, amount, starts_on, ends_on
