-- migrate:up

-- Food values are often derived (per oz from a per-serving label), so keep 6 decimal
-- places instead of 2-3. Widening only: existing values are kept as they are.
-- Goals stay numeric(10,2): they're round numbers the user types in.

ALTER TABLE nutrition.food_items
    ALTER COLUMN standard_quantity TYPE numeric(16,6),
    ALTER COLUMN calories          TYPE numeric(16,6),
    ALTER COLUMN protein_g         TYPE numeric(16,6),
    ALTER COLUMN total_fat_g       TYPE numeric(16,6),
    ALTER COLUMN saturated_fat_g   TYPE numeric(16,6),
    ALTER COLUMN trans_fat_g       TYPE numeric(16,6),
    ALTER COLUMN cholesterol_mg    TYPE numeric(16,6),
    ALTER COLUMN sodium_mg         TYPE numeric(16,6),
    ALTER COLUMN total_carbs_g     TYPE numeric(16,6),
    ALTER COLUMN fiber_g           TYPE numeric(16,6),
    ALTER COLUMN total_sugars_g    TYPE numeric(16,6),
    ALTER COLUMN added_sugars_g    TYPE numeric(16,6);

ALTER TABLE nutrition.food_item_logs
    ALTER COLUMN servings TYPE numeric(16,6);

-- migrate:down

-- Rounds anything finer than the old precision.
ALTER TABLE nutrition.food_items
    ALTER COLUMN standard_quantity TYPE numeric(10,3),
    ALTER COLUMN calories          TYPE numeric(10,2),
    ALTER COLUMN protein_g         TYPE numeric(10,2),
    ALTER COLUMN total_fat_g       TYPE numeric(10,2),
    ALTER COLUMN saturated_fat_g   TYPE numeric(10,2),
    ALTER COLUMN trans_fat_g       TYPE numeric(10,2),
    ALTER COLUMN cholesterol_mg    TYPE numeric(10,2),
    ALTER COLUMN sodium_mg         TYPE numeric(10,2),
    ALTER COLUMN total_carbs_g     TYPE numeric(10,2),
    ALTER COLUMN fiber_g           TYPE numeric(10,2),
    ALTER COLUMN total_sugars_g    TYPE numeric(10,2),
    ALTER COLUMN added_sugars_g    TYPE numeric(10,2);

ALTER TABLE nutrition.food_item_logs
    ALTER COLUMN servings TYPE numeric(10,3);
