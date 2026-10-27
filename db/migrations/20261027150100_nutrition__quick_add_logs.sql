-- migrate:up

-- Quick adds: a log entry with its own name and nutrients instead of a repo food, for
-- one-off estimates that shouldn't clutter the repo. See docs/db/nutrition.md.
--
-- A quick add has no food_item_id; its nutrients are totals for what was eaten, and its
-- servings is always 1 so entry math (value x servings) is the same for both kinds.
-- A repo entry leaves all of these columns NULL and reads its values from the food.

ALTER TABLE nutrition.food_item_logs
    ALTER COLUMN food_item_id DROP NOT NULL,
    ADD COLUMN name            text CHECK (length(trim(name)) > 0),
    ADD COLUMN calories        numeric(16,6) CHECK (calories >= 0),
    ADD COLUMN protein_g       numeric(16,6) CHECK (protein_g >= 0),
    ADD COLUMN total_fat_g     numeric(16,6) CHECK (total_fat_g >= 0),
    ADD COLUMN saturated_fat_g numeric(16,6) CHECK (saturated_fat_g >= 0),
    ADD COLUMN trans_fat_g     numeric(16,6) CHECK (trans_fat_g >= 0),
    ADD COLUMN cholesterol_mg  numeric(16,6) CHECK (cholesterol_mg >= 0),
    ADD COLUMN sodium_mg       numeric(16,6) CHECK (sodium_mg >= 0),
    ADD COLUMN total_carbs_g   numeric(16,6) CHECK (total_carbs_g >= 0),
    ADD COLUMN fiber_g         numeric(16,6) CHECK (fiber_g >= 0),
    ADD COLUMN total_sugars_g  numeric(16,6) CHECK (total_sugars_g >= 0),
    ADD COLUMN added_sugars_g  numeric(16,6) CHECK (added_sugars_g >= 0),
    -- Exactly one of: a repo food, or a quick add's own name (with servings fixed at 1).
    ADD CONSTRAINT food_item_logs_food_or_quick_check CHECK (
        (food_item_id IS NOT NULL AND name IS NULL
         AND num_nonnulls(calories, protein_g, total_fat_g, saturated_fat_g, trans_fat_g,
                          cholesterol_mg, sodium_mg, total_carbs_g, fiber_g,
                          total_sugars_g, added_sugars_g) = 0)
        OR (food_item_id IS NULL AND name IS NOT NULL AND servings = 1)
    );

-- migrate:down

-- Quick adds can't be represented without these columns, so they're removed first.
DELETE FROM nutrition.food_item_logs WHERE food_item_id IS NULL;
ALTER TABLE nutrition.food_item_logs
    DROP CONSTRAINT food_item_logs_food_or_quick_check,
    DROP COLUMN name,
    DROP COLUMN calories,
    DROP COLUMN protein_g,
    DROP COLUMN total_fat_g,
    DROP COLUMN saturated_fat_g,
    DROP COLUMN trans_fat_g,
    DROP COLUMN cholesterol_mg,
    DROP COLUMN sodium_mg,
    DROP COLUMN total_carbs_g,
    DROP COLUMN fiber_g,
    DROP COLUMN total_sugars_g,
    DROP COLUMN added_sugars_g,
    ALTER COLUMN food_item_id SET NOT NULL;
