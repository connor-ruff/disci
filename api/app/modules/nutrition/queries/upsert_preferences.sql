INSERT INTO nutrition.preferences (user_id, tracked_nutrients)
VALUES (%(user_id)s, %(tracked_nutrients)s)
ON CONFLICT (user_id) DO UPDATE SET tracked_nutrients = EXCLUDED.tracked_nutrients
RETURNING tracked_nutrients
