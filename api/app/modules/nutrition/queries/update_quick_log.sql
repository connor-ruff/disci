UPDATE nutrition.food_item_logs
SET eaten_on = %(eaten_on)s, notes = %(notes)s, name = %(name)s,
    calories = %(calories)s, protein_g = %(protein_g)s, total_fat_g = %(total_fat_g)s,
    saturated_fat_g = %(saturated_fat_g)s, trans_fat_g = %(trans_fat_g)s, cholesterol_mg = %(cholesterol_mg)s,
    sodium_mg = %(sodium_mg)s, total_carbs_g = %(total_carbs_g)s, fiber_g = %(fiber_g)s,
    total_sugars_g = %(total_sugars_g)s, added_sugars_g = %(added_sugars_g)s
WHERE id = %(log_id)s AND food_item_id IS NULL AND deleted_at IS NULL
RETURNING id
