-- migrate:up

-- Tasks module: task definitions of four fixed types, and a log of every check-off.
-- See docs/db/tasks.md.
--
-- Progress is never stored on the task: today's tally, "done" and "last done" are counted
-- from task_completions, so a new day starts at zero without a reset job, and history
-- (what got done when) is kept.
--
-- Multi-user integrity: child foreign keys include user_id (see finance's init migration).

CREATE SCHEMA tasks;

-- ---------------------------------------------------------------------------
-- tasks.tasks: one row per task. Which columns apply depends on task_type.
-- ---------------------------------------------------------------------------

CREATE TABLE tasks.tasks (
    id           uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id      uuid        NOT NULL REFERENCES core.users (id),
    task_type    text        NOT NULL CHECK (task_type IN (
                     'daily_checklist', 'nondaily_maintenance', 'adhoc_to_do', 'keep_in_mind')),
    name         text        NOT NULL CHECK (length(trim(name)) > 0),
    description  text,
    -- Maintenance cadence: due again repeat_every x repeat_unit after it's done.
    repeat_every integer     CHECK (repeat_every > 0),
    repeat_unit  text        CHECK (repeat_unit IN ('day', 'week', 'month', 'quarter', 'year')),
    -- Maintenance: when it's next due (moved forward by each completion; editable to
    -- snooze). Ad-hoc: its optional due date.
    next_due     date,
    -- Daily checklist: check-offs a day needs to be done (e.g. 5 sets).
    daily_target integer     CHECK (daily_target > 0),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    deleted_at   timestamptz,
    UNIQUE (id, user_id),
    CHECK ((repeat_every IS NULL) = (repeat_unit IS NULL)),
    -- One rule per type, so adding a type never rewrites the others.
    CHECK (task_type <> 'daily_checklist'
           OR (daily_target IS NOT NULL AND repeat_every IS NULL AND next_due IS NULL)),
    CHECK (task_type <> 'nondaily_maintenance'
           OR (repeat_every IS NOT NULL AND next_due IS NOT NULL AND daily_target IS NULL)),
    CHECK (task_type <> 'adhoc_to_do'
           OR (repeat_every IS NULL AND daily_target IS NULL)),
    CHECK (task_type <> 'keep_in_mind'
           OR (repeat_every IS NULL AND next_due IS NULL AND daily_target IS NULL))
);

CREATE INDEX tasks_user_idx ON tasks.tasks (user_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- tasks.task_completions: one row per check-off. Undo soft-deletes the row.
-- ---------------------------------------------------------------------------

CREATE TABLE tasks.task_completions (
    id           uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id      uuid        NOT NULL REFERENCES core.users (id),
    task_id      uuid        NOT NULL,
    completed_on date        NOT NULL,  -- the day it counts toward, in the user's timezone
    -- Maintenance and ad-hoc: the task's next_due when it was done (undo restores it).
    due_on       date,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    deleted_at   timestamptz,
    FOREIGN KEY (task_id, user_id) REFERENCES tasks.tasks (id, user_id)
);

CREATE INDEX task_completions_task_idx
    ON tasks.task_completions (task_id, completed_on DESC) WHERE deleted_at IS NULL;
CREATE INDEX task_completions_user_day_idx
    ON tasks.task_completions (user_id, completed_on) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- updated_at triggers and row-level security
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['tasks', 'task_completions'] LOOP
        EXECUTE format(
            'CREATE TRIGGER set_updated_at BEFORE UPDATE ON tasks.%I
                 FOR EACH ROW EXECUTE FUNCTION core.set_updated_at()', t);
        EXECUTE format('ALTER TABLE tasks.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY owner ON tasks.%I TO disci_app
                 USING (user_id = core.current_user_id())
                 WITH CHECK (user_id = core.current_user_id())', t);
    END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Privileges for the API role
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA tasks TO disci_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tasks TO disci_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA tasks
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO disci_app;

-- migrate:down

DROP SCHEMA tasks CASCADE;
