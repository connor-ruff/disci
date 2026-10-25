-- migrate:up

-- Finance module, first slice: budgets, categories, budget items, transactions and
-- allocations. Recurring transactions come in a later migration. See docs/db/finance.md.
--
-- Multi-user integrity: every child foreign key includes user_id, pointing at a
-- (id, user_id) unique key on the parent. RLS limits what a user can see, but FK checks
-- bypass RLS, so without this a user who guessed another user's row id could link to it.

CREATE SCHEMA finance;

-- ---------------------------------------------------------------------------
-- finance.budget_categories
-- ---------------------------------------------------------------------------

CREATE TABLE finance.budget_categories (
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id    uuid        NOT NULL REFERENCES core.users (id),
    kind       text        NOT NULL CHECK (kind IN ('expense', 'income')),
    name       text        NOT NULL CHECK (length(trim(name)) > 0),
    color      text,
    icon       text,
    sort_order integer     NOT NULL DEFAULT 0,
    is_default boolean     NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    -- Target of budget_items' composite FK: an item may only use a category of its kind.
    UNIQUE (id, kind, user_id)
);

CREATE UNIQUE INDEX budget_categories_name_key
    ON finance.budget_categories (user_id, kind, lower(name)) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- finance.budgets
-- ---------------------------------------------------------------------------

CREATE TABLE finance.budgets (
    id           uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id      uuid        NOT NULL REFERENCES core.users (id),
    name         text        NOT NULL CHECK (length(trim(name)) > 0),
    period_type  text        NOT NULL CHECK (period_type IN ('week', 'month', 'year')),
    period_start date        NOT NULL,
    period_end   date        NOT NULL,
    notes        text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    deleted_at   timestamptz,
    CHECK (period_end >= period_start),
    UNIQUE (id, user_id)
    -- No uniqueness on the period: several budgets may cover the same month.
);

CREATE INDEX budgets_user_period_idx ON finance.budgets (user_id, period_start DESC);

-- ---------------------------------------------------------------------------
-- finance.budget_items
-- ---------------------------------------------------------------------------

CREATE TABLE finance.budget_items (
    id             uuid          PRIMARY KEY DEFAULT uuidv7(),
    user_id        uuid          NOT NULL REFERENCES core.users (id),
    budget_id      uuid          NOT NULL,
    kind           text          NOT NULL CHECK (kind IN ('expense', 'income')),
    category_id    uuid,         -- NULL = Uncategorized
    name           text          NOT NULL CHECK (length(trim(name)) > 0),
    planned_amount numeric(12,2) NOT NULL CHECK (planned_amount >= 0),
    sort_order     integer       NOT NULL DEFAULT 0,
    notes          text,
    created_at     timestamptz   NOT NULL DEFAULT now(),
    updated_at     timestamptz   NOT NULL DEFAULT now(),
    deleted_at     timestamptz,
    UNIQUE (id, user_id),
    FOREIGN KEY (budget_id, user_id) REFERENCES finance.budgets (id, user_id),
    -- MATCH SIMPLE: skipped when category_id is NULL (Uncategorized).
    FOREIGN KEY (category_id, kind, user_id)
        REFERENCES finance.budget_categories (id, kind, user_id)
);

CREATE INDEX budget_items_budget_idx ON finance.budget_items (budget_id) WHERE deleted_at IS NULL;
CREATE INDEX budget_items_category_idx ON finance.budget_items (category_id) WHERE category_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- finance.transactions
-- ---------------------------------------------------------------------------

CREATE TABLE finance.transactions (
    id          uuid          PRIMARY KEY DEFAULT uuidv7(),
    user_id     uuid          NOT NULL REFERENCES core.users (id),
    kind        text          NOT NULL CHECK (kind IN ('expense', 'income')),
    amount      numeric(12,2) NOT NULL CHECK (amount > 0),
    occurred_on date          NOT NULL,
    payee       text,
    description text,
    notes       text,
    created_at  timestamptz   NOT NULL DEFAULT now(),
    updated_at  timestamptz   NOT NULL DEFAULT now(),
    deleted_at  timestamptz,
    UNIQUE (id, user_id)
);

CREATE INDEX transactions_user_date_idx ON finance.transactions (user_id, occurred_on DESC);

-- ---------------------------------------------------------------------------
-- finance.transaction_allocations
-- ---------------------------------------------------------------------------

-- Which budget item(s) a transaction counts toward, and how much. Either kind of
-- transaction may go to either kind of item: opposite kinds net (a grocery rebate is
-- a credit against Groceries). Rows are replaced, not edited, so they're hard-deleted
-- (an exception to the soft-delete convention; they carry no history of their own).
CREATE TABLE finance.transaction_allocations (
    id             uuid          PRIMARY KEY DEFAULT uuidv7(),
    user_id        uuid          NOT NULL REFERENCES core.users (id),
    transaction_id uuid          NOT NULL,
    budget_item_id uuid          NOT NULL,
    amount         numeric(12,2) NOT NULL CHECK (amount > 0),
    created_at     timestamptz   NOT NULL DEFAULT now(),
    updated_at     timestamptz   NOT NULL DEFAULT now(),
    UNIQUE (transaction_id, budget_item_id),
    FOREIGN KEY (transaction_id, user_id) REFERENCES finance.transactions (id, user_id),
    FOREIGN KEY (budget_item_id, user_id) REFERENCES finance.budget_items (id, user_id)
);

CREATE INDEX transaction_allocations_item_idx ON finance.transaction_allocations (budget_item_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers and row-level security
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'budget_categories', 'budgets', 'budget_items', 'transactions', 'transaction_allocations'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.%I
                 FOR EACH ROW EXECUTE FUNCTION core.set_updated_at()', t);
        EXECUTE format('ALTER TABLE finance.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY owner ON finance.%I TO disci_app
                 USING (user_id = core.current_user_id())
                 WITH CHECK (user_id = core.current_user_id())', t);
    END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Privileges for the API role
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA finance TO disci_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA finance TO disci_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO disci_app;

-- migrate:down

DROP SCHEMA finance CASCADE;
