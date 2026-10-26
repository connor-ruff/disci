-- Past days that logged this food are recalculated with the new values (foods aren't versioned).
UPDATE nutrition.food_items
SET name = %(name)s, description = %(description)s,
    standard_quantity = %(standard_quantity)s, standard_unit = %(standard_unit)s,
    calories = %(calories)s, protein_g = %(protein_g)s, total_fat_g = %(total_fat_g)s,
    saturated_fat_g = %(saturated_fat_g)s, trans_fat_g = %(trans_fat_g)s,
    cholesterol_mg = %(cholesterol_mg)s, sodium_mg = %(sodium_mg)s,
    total_carbs_g = %(total_carbs_g)s, fiber_g = %(fiber_g)s,
    total_sugars_g = %(total_sugars_g)s, added_sugars_g = %(added_sugars_g)s
WHERE id = %(food_id)s AND deleted_at IS NULL
RETURNING id
