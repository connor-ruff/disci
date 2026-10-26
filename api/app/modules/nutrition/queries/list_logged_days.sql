-- Days with at least one entry, newest first, before an optional cursor.
SELECT eaten_on
FROM nutrition.food_item_logs
WHERE deleted_at IS NULL AND (%(before)s::date IS NULL OR eaten_on < %(before)s::date)
GROUP BY eaten_on
ORDER BY eaten_on DESC
LIMIT %(limit)s
