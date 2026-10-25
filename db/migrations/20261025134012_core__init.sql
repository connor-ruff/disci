-- migrate:up

-- Shared tables every module depends on. See docs/db/shared.md and the
-- conventions in docs/db/db-overview.md.

CREATE SCHEMA core;

-- Role the API runs as. It is not the table owner, so row-level security
-- applies to it. Environment-specific login users are granted membership.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'disci_app') THEN
        CREATE ROLE disci_app NOLOGIN;
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Helpers shared by every module
-- ---------------------------------------------------------------------------

-- Keeps updated_at current. Attach to every table with a BEFORE UPDATE trigger.
CREATE FUNCTION core.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END
$$;

-- The user the current request acts as. The API runs
-- SET LOCAL app.user_id = '<uuid>' at the start of each transaction.
-- Returns NULL when unset, so RLS policies match no rows.
CREATE FUNCTION core.current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- core.users
-- ---------------------------------------------------------------------------

CREATE TABLE core.users (
    id             uuid        PRIMARY KEY DEFAULT uuidv7(),
    cognito_sub    text        NOT NULL,
    email          text        NOT NULL,
    display_name   text,
    timezone       text        NOT NULL DEFAULT 'UTC',
    week_starts_on smallint    NOT NULL DEFAULT 1 CHECK (week_starts_on BETWEEN 1 AND 7), -- ISO: 1 = Monday, 7 = Sunday
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    deleted_at     timestamptz
);

CREATE UNIQUE INDEX users_cognito_sub_key ON core.users (cognito_sub) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX users_email_key ON core.users (lower(email)) WHERE deleted_at IS NULL;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON core.users
    FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

ALTER TABLE core.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_self ON core.users TO disci_app
    USING (id = core.current_user_id())
    WITH CHECK (id = core.current_user_id());

-- Maps a Cognito identity to a user row, creating it on first sign-in.
-- SECURITY DEFINER because it must run before app.user_id is known, so it
-- bypasses RLS. Callable by the API, and it only ever touches the caller's row.
CREATE FUNCTION core.ensure_user(p_cognito_sub text, p_email text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, core AS $$
DECLARE
    v_id uuid;
BEGIN
    SELECT id INTO v_id FROM core.users
    WHERE cognito_sub = p_cognito_sub AND deleted_at IS NULL;

    IF v_id IS NULL THEN
        INSERT INTO core.users (cognito_sub, email)
        VALUES (p_cognito_sub, p_email)
        ON CONFLICT (cognito_sub) WHERE deleted_at IS NULL DO NOTHING
        RETURNING id INTO v_id;

        -- Lost a race with a concurrent first request; the row exists now.
        IF v_id IS NULL THEN
            SELECT id INTO v_id FROM core.users
            WHERE cognito_sub = p_cognito_sub AND deleted_at IS NULL;
        END IF;
    END IF;

    RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION core.ensure_user(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.ensure_user(text, text) TO disci_app;

-- ---------------------------------------------------------------------------
-- core.user_modules
-- ---------------------------------------------------------------------------

CREATE TABLE core.user_modules (
    id          uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id     uuid        NOT NULL REFERENCES core.users (id),
    module_key  text        NOT NULL CHECK (module_key IN ('finance', 'tasks', 'nutrition')),
    enabled_at  timestamptz NOT NULL DEFAULT now(),
    disabled_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    deleted_at  timestamptz
);

CREATE UNIQUE INDEX user_modules_user_module_key ON core.user_modules (user_id, module_key) WHERE deleted_at IS NULL;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON core.user_modules
    FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

ALTER TABLE core.user_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_modules_owner ON core.user_modules TO disci_app
    USING (user_id = core.current_user_id())
    WITH CHECK (user_id = core.current_user_id());

-- ---------------------------------------------------------------------------
-- Privileges for the API role
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA core TO disci_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core TO disci_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA core
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO disci_app;

-- migrate:down

DROP SCHEMA core CASCADE;
-- The disci_app role is cluster-wide and intentionally left in place.
