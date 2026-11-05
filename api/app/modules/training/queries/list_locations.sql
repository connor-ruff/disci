-- Locations used before, most recently used first.
SELECT location
FROM training.workouts
WHERE deleted_at IS NULL AND location IS NOT NULL
GROUP BY location
ORDER BY max(date) DESC, max(created_at) DESC
LIMIT %(limit)s
