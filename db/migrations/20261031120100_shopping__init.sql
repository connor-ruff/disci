-- migrate:up

-- Shopping list module: the user's own kinds of shopping (types), what's on the list now,
-- and a repo of common items to add in one tap. See docs/db/shopping.md.
--
-- List items are hard-deleted when removed: once bought and cleared there's nothing worth
-- keeping. Adding a common item copies its name, type and note; the list item keeps no
-- link to it.
--
-- Multi-user integrity: child foreign keys include user_id (see finance's init migration).

CREATE SCHEMA shopping;

-- ---------------------------------------------------------------------------
-- shopping.shopping_types: the user's kinds of shopping ("Groceries", "Kroger", "Clothing").
-- ---------------------------------------------------------------------------

CREATE TABLE shopping.shopping_types (
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id    uuid        NOT NULL REFERENCES core.users (id),
    name       text        NOT NULL CHECK (length(trim(name)) > 0),
    sort_order integer     NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (id, user_id)
);

CREATE UNIQUE INDEX shopping_types_user_name
    ON shopping.shopping_types (user_id, lower(name)) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- shopping.list_items: what's on the list. done_at set = crossed off (still shown until
-- removed). No deleted_at: removing an item deletes the row.
-- ---------------------------------------------------------------------------

CREATE TABLE shopping.list_items (
    id               uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id          uuid        NOT NULL REFERENCES core.users (id),
    shopping_type_id uuid,       -- null = Uncategorized
    name             text        NOT NULL CHECK (length(trim(name)) > 0),
    notes            text,
    sort_order       integer     NOT NULL DEFAULT 0,
    done_at          timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (shopping_type_id, user_id) REFERENCES shopping.shopping_types (id, user_id)
);

CREATE INDEX list_items_user_idx ON shopping.list_items (user_id);

-- ---------------------------------------------------------------------------
-- shopping.common_items: things bought often, added to the list in one tap.
-- ---------------------------------------------------------------------------

CREATE TABLE shopping.common_items (
    id               uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id          uuid        NOT NULL REFERENCES core.users (id),
    shopping_type_id uuid,       -- null = Uncategorized
    name             text        NOT NULL CHECK (length(trim(name)) > 0),
    notes            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    FOREIGN KEY (shopping_type_id, user_id) REFERENCES shopping.shopping_types (id, user_id)
);

-- One "Eggs" per type (Uncategorized counts as a type: NULLS NOT DISTINCT).
CREATE UNIQUE INDEX common_items_user_type_name
    ON shopping.common_items (user_id, shopping_type_id, lower(name)) NULLS NOT DISTINCT
    WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- updated_at triggers and row-level security
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['shopping_types', 'list_items', 'common_items'] LOOP
        EXECUTE format(
            'CREATE TRIGGER set_updated_at BEFORE UPDATE ON shopping.%I
                 FOR EACH ROW EXECUTE FUNCTION core.set_updated_at()', t);
        EXECUTE format('ALTER TABLE shopping.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY owner ON shopping.%I TO disci_app
                 USING (user_id = core.current_user_id())
                 WITH CHECK (user_id = core.current_user_id())', t);
    END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Privileges for the API role
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA shopping TO disci_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA shopping TO disci_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA shopping
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO disci_app;

-- migrate:down

DROP SCHEMA shopping CASCADE;
