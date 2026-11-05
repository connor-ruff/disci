-- migrate:up

-- Training module, part 2: training plans. A plan is a set of targets laid over the
-- calendar: planned miles per day (plan_days) and optional weekly targets (plan_weeks).
-- Workouts never reference a plan; plan vs. done is matched by date when it's read.
-- See docs/db/training.md.
--
-- A user can have many plans (old ones stay as history) but at most one active.
-- plan_days and plan_weeks are replaced week by week (or all at once on import), so
-- they're hard-deleted (no deleted_at). A day with no plan_days row is a rest day.

CREATE TABLE training.plans (
    id                 uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id            uuid        NOT NULL REFERENCES core.users (id),
    name               text        NOT NULL CHECK (length(trim(name)) > 0),
    race_name          text,
    race_on            date,
    starts_on          date        NOT NULL,
    is_active          boolean     NOT NULL DEFAULT false,
    -- Rule settings: how actuals are scored against this plan.
    count_walk_miles   boolean     NOT NULL DEFAULT false,
    cross_train_at_pct smallint    NOT NULL DEFAULT 90 CHECK (cross_train_at_pct BETWEEN 1 AND 200),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    deleted_at         timestamptz,
    UNIQUE (id, user_id)
);

-- At most one active plan per user.
CREATE UNIQUE INDEX plans_one_active
    ON training.plans (user_id) WHERE is_active AND deleted_at IS NULL;

CREATE TABLE training.plan_days (
    id            uuid         PRIMARY KEY DEFAULT uuidv7(),
    user_id       uuid         NOT NULL REFERENCES core.users (id),
    plan_id       uuid         NOT NULL,
    day_on        date         NOT NULL,
    planned_miles numeric(6,2) NOT NULL CHECK (planned_miles > 0),
    notes         text,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (plan_id, day_on),
    FOREIGN KEY (plan_id, user_id) REFERENCES training.plans (id, user_id)
);

CREATE TABLE training.plan_weeks (
    id             uuid         PRIMARY KEY DEFAULT uuidv7(),
    user_id        uuid         NOT NULL REFERENCES core.users (id),
    plan_id        uuid         NOT NULL,
    week_starts_on date         NOT NULL,
    target_miles   numeric(6,2) NOT NULL CHECK (target_miles > 0),
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (plan_id, week_starts_on),
    FOREIGN KEY (plan_id, user_id) REFERENCES training.plans (id, user_id)
);

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['plans', 'plan_days', 'plan_weeks'] LOOP
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

-- Grants come from the schema's default privileges (training__init).

-- migrate:down

DROP TABLE training.plan_weeks;
DROP TABLE training.plan_days;
DROP TABLE training.plans;
