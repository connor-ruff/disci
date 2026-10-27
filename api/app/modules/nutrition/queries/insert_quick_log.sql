-- A quick add: its own name and nutrients (totals for what was eaten), no repo food.
INSERT INTO nutrition.food_item_logs
    (user_id, eaten_on, servings, notes, name,
     calories, protein_g, total_fat_g, saturated_fat_g, trans_fat_g, cholesterol_mg, sodium_mg, total_carbs_g, fiber_g, total_sugars_g, added_sugars_g)
VALUES (%(user_id)s, %(eaten_on)s, 1, %(notes)s, %(name)s,
        %(calories)s, %(protein_g)s, %(total_fat_g)s, %(saturated_fat_g)s, %(trans_fat_g)s, %(cholesterol_mg)s, %(sodium_mg)s, %(total_carbs_g)s, %(fiber_g)s, %(total_sugars_g)s, %(added_sugars_g)s)
RETURNING id
