-- migrate:up

-- Nutrition module: the food repo, the daily food log, daily macro goals and which
-- nutrients the user tracks. See docs/db/nutrition.md.
--
-- Nutrient columns are nullable everywhere: NULL means "unknown", never 0. Totals over
-- a day report which foods were missing a value instead of treating it as 0.
--
-- Multi-user integrity: child foreign keys include user_id (see finance's init migration).

CREATE SCHEMA nutrition;

-- ---------------------------------------------------------------------------
-- nutrition.food_items: the food repo. Nutrients are per one standard quantity.
-- ---------------------------------------------------------------------------

CREATE TABLE nutrition.food_items (
    id                uuid          PRIMARY KEY DEFAULT uuidv7(),
    user_id           uuid          NOT NULL REFERENCES core.users (id),
    name              text          NOT NULL CHECK (length(trim(name)) > 0),
    description       text,
    -- Everything is logged as a multiple of this: (100, 'g'), (1, 'oz'), (1, 'tbsp').
    standard_quantity numeric(10,3) NOT NULL CHECK (standard_quantity > 0),
    standard_unit     text          NOT NULL CHECK (length(trim(standard_unit)) > 0),
    calories          numeric(10,2) CHECK (calories >= 0),         -- kcal
    protein_g         numeric(10,2) CHECK (protein_g >= 0),
    total_fat_g       numeric(10,2) CHECK (total_fat_g >= 0),
    saturated_fat_g   numeric(10,2) CHECK (saturated_fat_g >= 0),
    trans_fat_g       numeric(10,2) CHECK (trans_fat_g >= 0),
    cholesterol_mg    numeric(10,2) CHECK (cholesterol_mg >= 0),
    sodium_mg         numeric(10,2) CHECK (sodium_mg >= 0),
    total_carbs_g     numeric(10,2) CHECK (total_carbs_g >= 0),
    fiber_g           numeric(10,2) CHECK (fiber_g >= 0),
    total_sugars_g    numeric(10,2) CHECK (total_sugars_g >= 0),
    added_sugars_g    numeric(10,2) CHECK (added_sugars_g >= 0),
    created_at        timestamptz   NOT NULL DEFAULT now(),
    updated_at        timestamptz   NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    UNIQUE (id, user_id)
);

CREATE UNIQUE INDEX food_items_name_key
    ON nutrition.food_items (user_id, lower(name)) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- nutrition.food_item_logs: one row per thing eaten.
-- ---------------------------------------------------------------------------

CREATE TABLE nutrition.food_item_logs (
    id           uuid          PRIMARY KEY DEFAULT uuidv7(),
    user_id      uuid          NOT NULL REFERENCES core.users (id),
    food_item_id uuid          NOT NULL,
    eaten_on     date          NOT NULL,  -- the day it counts toward, in the user's timezone
    -- Multiples of the food's standard quantity: 1.2 x (100 g) = 120 g.
    servings     numeric(10,3) NOT NULL CHECK (servings > 0),
    notes        text,
    created_at   timestamptz   NOT NULL DEFAULT now(),
    updated_at   timestamptz   NOT NULL DEFAULT now(),
    deleted_at   timestamptz,
    -- A soft-deleted food stays referenced, so past days still show it.
    FOREIGN KEY (food_item_id, user_id) REFERENCES nutrition.food_items (id, user_id)
);

CREATE INDEX food_item_logs_user_day_idx
    ON nutrition.food_item_logs (user_id, eaten_on DESC) WHERE deleted_at IS NULL;
CREATE INDEX food_item_logs_food_idx ON nutrition.food_item_logs (food_item_id);

-- ---------------------------------------------------------------------------
-- nutrition.macro_goals: daily targets (reach at least) and limits (stay under).
-- ---------------------------------------------------------------------------

-- Effective-dated so past days keep the goals that applied then: a goal covers
-- starts_on..ends_on (inclusive; NULL = still active). Changing a goal ends the old
-- row yesterday and starts a new one today.
CREATE TABLE nutrition.macro_goals (
    id         uuid          PRIMARY KEY DEFAULT uuidv7(),
    user_id    uuid          NOT NULL REFERENCES core.users (id),
    nutrient   text          NOT NULL CHECK (nutrient IN (
                   'calories', 'protein_g', 'total_fat_g', 'saturated_fat_g', 'trans_fat_g',
                   'cholesterol_mg', 'sodium_mg', 'total_carbs_g', 'fiber_g',
                   'total_sugars_g', 'added_sugars_g')),
    kind       text          NOT NULL CHECK (kind IN ('target', 'limit')),
    amount     numeric(10,2) NOT NULL CHECK (amount > 0),
    starts_on  date          NOT NULL,
    ends_on    date,
    created_at timestamptz   NOT NULL DEFAULT now(),
    updated_at timestamptz   NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

-- One active goal of each kind per nutrient (a calorie target and a calorie limit may coexist).
CREATE UNIQUE INDEX macro_goals_active_key
    ON nutrition.macro_goals (user_id, nutrient, kind) WHERE ends_on IS NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- nutrition.preferences: which nutrients the user tracks (one row per user).
-- ---------------------------------------------------------------------------

CREATE TABLE nutrition.preferences (
    id                 uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id            uuid        NOT NULL UNIQUE REFERENCES core.users (id),
    -- Display order is the app's nutrient order, not this array's.
    tracked_nutrients  text[]      NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CHECK (tracked_nutrients <@ ARRAY[
        'calories', 'protein_g', 'total_fat_g', 'saturated_fat_g', 'trans_fat_g',
        'cholesterol_mg', 'sodium_mg', 'total_carbs_g', 'fiber_g',
        'total_sugars_g', 'added_sugars_g']::text[])
);

-- ---------------------------------------------------------------------------
-- updated_at triggers and row-level security
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['food_items', 'food_item_logs', 'macro_goals', 'preferences'] LOOP
        EXECUTE format(
            'CREATE TRIGGER set_updated_at BEFORE UPDATE ON nutrition.%I
                 FOR EACH ROW EXECUTE FUNCTION core.set_updated_at()', t);
        EXECUTE format('ALTER TABLE nutrition.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY owner ON nutrition.%I TO disci_app
                 USING (user_id = core.current_user_id())
                 WITH CHECK (user_id = core.current_user_id())', t);
    END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Privileges for the API role
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA nutrition TO disci_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA nutrition TO disci_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA nutrition
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO disci_app;

-- migrate:down

DROP SCHEMA nutrition CASCADE;
