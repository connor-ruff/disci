-- migrate:up

-- Training module, part 1: the workout log. One row per session (run, walk, bike or
-- lift), a per-user catalog of lifts, and optional per-set lift detail.
-- See docs/db/training.md.
--
-- Lift sets are replaced as a whole when their workout is edited, so they're
-- hard-deleted (no deleted_at), like finance's transaction_allocations.
--
-- Multi-user integrity: child foreign keys include user_id (see finance's init migration).
-- lift_sets' key to workouts also includes the workout's type, pinned to 'lift', so sets
-- can only hang off a lift workout.

CREATE SCHEMA training;

-- ---------------------------------------------------------------------------
-- training.workouts: one row per session. Columns a type doesn't use are null.
-- ---------------------------------------------------------------------------

CREATE TABLE training.workouts (
    id                uuid         PRIMARY KEY DEFAULT uuidv7(),
    user_id           uuid         NOT NULL REFERENCES core.users (id),
    type              text         NOT NULL CHECK (type IN ('run', 'walk', 'bike', 'lift')),
    date              date         NOT NULL,  -- the day it counts toward, in the user's timezone
    location          text,                   -- free text ("Hoboken", "Treadmill", "Home gym")
    miles             numeric(6,2) CHECK (miles > 0),
    time_in_sec       integer      CHECK (time_in_sec > 0),
    elevation_gain_ft integer      CHECK (elevation_gain_ft >= 0),
    avg_heart_rate    smallint     CHECK (avg_heart_rate BETWEEN 20 AND 250),
    description       text,                   -- general; for a lift, the body parts ("back/chest")
    reflection        text,
    created_at        timestamptz  NOT NULL DEFAULT now(),
    updated_at        timestamptz  NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    UNIQUE (id, user_id, type),
    -- Lifts have no distance, elevation or heart rate.
    CHECK (type <> 'lift' OR (miles IS NULL AND elevation_gain_ft IS NULL AND avg_heart_rate IS NULL)),
    -- Runs and walks need a distance.
    CHECK (type NOT IN ('run', 'walk') OR miles IS NOT NULL)
);

CREATE INDEX workouts_user_date_idx ON training.workouts (user_id, date) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- training.lifts: the user's own catalog of lifts ("Bench press", "Squat").
-- ---------------------------------------------------------------------------

CREATE TABLE training.lifts (
    id          uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id     uuid        NOT NULL REFERENCES core.users (id),
    name        text        NOT NULL CHECK (length(trim(name)) > 0),
    description text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    deleted_at  timestamptz,
    UNIQUE (id, user_id)
);

CREATE UNIQUE INDEX lifts_user_name
    ON training.lifts (user_id, lower(name)) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- training.lift_sets: one row per set of a lift within a lift workout. set_number counts
-- across the whole workout, so it also records which lift came first. No deleted_at.
-- ---------------------------------------------------------------------------

CREATE TABLE training.lift_sets (
    id           uuid         PRIMARY KEY DEFAULT uuidv7(),
    user_id      uuid         NOT NULL REFERENCES core.users (id),
    workout_id   uuid         NOT NULL,
    workout_type text         NOT NULL DEFAULT 'lift' CHECK (workout_type = 'lift'),
    lift_id      uuid         NOT NULL,
    set_number   integer      NOT NULL CHECK (set_number >= 1),
    reps         integer      NOT NULL CHECK (reps BETWEEN 1 AND 1000),
    weight_num   numeric(6,2) CHECK (weight_num >= 0),  -- pounds; null = bodyweight
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (workout_id, set_number),
    FOREIGN KEY (workout_id, user_id, workout_type)
        REFERENCES training.workouts (id, user_id, type),
    FOREIGN KEY (lift_id, user_id) REFERENCES training.lifts (id, user_id)
);

CREATE INDEX lift_sets_lift_idx ON training.lift_sets (lift_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers and row-level security
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['workouts', 'lifts', 'lift_sets'] LOOP
        EXECUTE format(
            'CREATE TRIGGER set_updated_at BEFORE UPDATE ON training.%I
                 FOR EACH ROW EXECUTE FUNCTION core.set_updated_at()', t);
        EXECUTE format('ALTER TABLE training.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY owner ON training.%I TO disci_app
                 USING (user_id = core.current_user_id())
                 WITH CHECK (user_id = core.current_user_id())', t);
    END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Privileges for the API role
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA training TO disci_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA training TO disci_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA training
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO disci_app;

-- migrate:down

DROP SCHEMA training CASCADE;
