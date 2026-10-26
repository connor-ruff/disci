SELECT
    f.id, f.name, f.description, f.standard_quantity, f.standard_unit,
    f.calories, f.protein_g, f.total_fat_g, f.saturated_fat_g, f.trans_fat_g,
    f.cholesterol_mg, f.sodium_mg, f.total_carbs_g, f.fiber_g, f.total_sugars_g, f.added_sugars_g,
    (SELECT max(l.eaten_on) FROM nutrition.food_item_logs l
     WHERE l.food_item_id = f.id AND l.deleted_at IS NULL) AS last_logged_on
FROM nutrition.food_items f
WHERE f.id = %(food_id)s AND f.deleted_at IS NULL
