-- Only foods still in the repo can be logged (the FK alone would accept a deleted one).
INSERT INTO nutrition.food_item_logs (user_id, food_item_id, eaten_on, servings, notes)
SELECT %(user_id)s, f.id, %(eaten_on)s, %(servings)s, %(notes)s
FROM nutrition.food_items f
WHERE f.id = %(food_item_id)s AND f.deleted_at IS NULL
RETURNING id
