-- A repo entry reads its name and per-standard nutrients from its food; a quick add
-- (no food) carries its own, with servings 1. The check constraint keeps the other side NULL.
SELECT
    l.id, l.food_item_id, l.eaten_on, l.servings, l.notes,
    coalesce(f.name, l.name) AS food_name, f.deleted_at IS NOT NULL AS food_deleted,
    f.standard_quantity, f.standard_unit,
    coalesce(f.calories, l.calories) AS calories, coalesce(f.protein_g, l.protein_g) AS protein_g,
    coalesce(f.total_fat_g, l.total_fat_g) AS total_fat_g, coalesce(f.saturated_fat_g, l.saturated_fat_g) AS saturated_fat_g,
    coalesce(f.trans_fat_g, l.trans_fat_g) AS trans_fat_g, coalesce(f.cholesterol_mg, l.cholesterol_mg) AS cholesterol_mg,
    coalesce(f.sodium_mg, l.sodium_mg) AS sodium_mg, coalesce(f.total_carbs_g, l.total_carbs_g) AS total_carbs_g,
    coalesce(f.fiber_g, l.fiber_g) AS fiber_g, coalesce(f.total_sugars_g, l.total_sugars_g) AS total_sugars_g,
    coalesce(f.added_sugars_g, l.added_sugars_g) AS added_sugars_g
FROM nutrition.food_item_logs l
LEFT JOIN nutrition.food_items f ON f.id = l.food_item_id
WHERE l.id = %(log_id)s AND l.deleted_at IS NULL
