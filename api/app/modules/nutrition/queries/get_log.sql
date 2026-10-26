SELECT
    l.id, l.food_item_id, l.eaten_on, l.servings, l.notes,
    f.name AS food_name, f.deleted_at IS NOT NULL AS food_deleted,
    f.standard_quantity, f.standard_unit,
    f.calories, f.protein_g, f.total_fat_g, f.saturated_fat_g, f.trans_fat_g,
    f.cholesterol_mg, f.sodium_mg, f.total_carbs_g, f.fiber_g, f.total_sugars_g, f.added_sugars_g
FROM nutrition.food_item_logs l
JOIN nutrition.food_items f ON f.id = l.food_item_id
WHERE l.id = %(log_id)s AND l.deleted_at IS NULL
