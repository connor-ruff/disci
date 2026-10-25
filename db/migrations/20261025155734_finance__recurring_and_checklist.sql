-- migrate:up

-- Finance, second slice: recurring transactions, approvals, the monthly checklist,
-- category descriptions and transaction notes/flags. See docs/db/finance.md.

-- ---------------------------------------------------------------------------
-- Category descriptions (optional; defaults have none)
-- ---------------------------------------------------------------------------

ALTER TABLE finance.budget_categories ADD COLUMN description text;

-- ---------------------------------------------------------------------------
-- Monthly checklist on budget items
-- ---------------------------------------------------------------------------

-- A checklist item is due on checklist_day (1-28) of its budget's month. The API only
-- allows it on items in monthly budgets.
ALTER TABLE finance.budget_items
    ADD COLUMN is_checklist_item boolean NOT NULL DEFAULT false,
    ADD COLUMN checklist_day     smallint CHECK (checklist_day BETWEEN 1 AND 28),
    ADD CONSTRAINT budget_items_checklist_check
        CHECK (is_checklist_item = (checklist_day IS NOT NULL));

-- ---------------------------------------------------------------------------
-- finance.recurring_transactions
-- ---------------------------------------------------------------------------

-- A rule for money that moves on a schedule. An hourly job creates one transaction per
-- occurrence on its date (in the user's timezone), never for dates before the rule
-- was created.
CREATE TABLE finance.recurring_transactions (
    id                  uuid          PRIMARY KEY DEFAULT uuidv7(),
    user_id             uuid          NOT NULL REFERENCES core.users (id),
    kind                text          NOT NULL CHECK (kind IN ('expense', 'income')),
    -- The budget item it counts toward (matched by kind + name, created if missing).
    name                text          NOT NULL CHECK (length(trim(name)) > 0),
    category_id         uuid,
    amount              numeric(12,2) NOT NULL CHECK (amount > 0),
    payee               text,
    notes               text,
    frequency           text          NOT NULL
                            CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'yearly')),
    day_of_week         smallint      CHECK (day_of_week BETWEEN 1 AND 7),   -- ISO, weekly
    day_of_month        smallint      CHECK (day_of_month BETWEEN 1 AND 28), -- monthly
    -- First occurrence for quarterly/yearly (which repeat from it); earliest date for all.
    starts_on           date          NOT NULL,
    ends_on             date,
    auto_apply          boolean       NOT NULL DEFAULT false,
    requires_approval   boolean       NOT NULL DEFAULT false,
    satisfies_checklist boolean       NOT NULL DEFAULT false,
    paused_at           timestamptz,
    created_at          timestamptz   NOT NULL DEFAULT now(),
    updated_at          timestamptz   NOT NULL DEFAULT now(),
    deleted_at          timestamptz,
    UNIQUE (id, user_id),
    FOREIGN KEY (category_id, kind, user_id)
        REFERENCES finance.budget_categories (id, kind, user_id),
    CHECK ((frequency = 'weekly') = (day_of_week IS NOT NULL)),
    CHECK ((frequency = 'monthly') = (day_of_month IS NOT NULL)),
    -- Quarterly repeats on the start date's day-of-month, which must exist every month.
    CHECK (frequency <> 'quarterly' OR extract(day FROM starts_on) <= 28),
    CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.recurring_transactions
    FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
ALTER TABLE finance.recurring_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner ON finance.recurring_transactions TO disci_app
    USING (user_id = core.current_user_id())
    WITH CHECK (user_id = core.current_user_id());

-- ---------------------------------------------------------------------------
-- Transactions: notes are already a column; add status, recurring link, checklist flag
-- ---------------------------------------------------------------------------

ALTER TABLE finance.transactions
    -- pending = created by a rule that requires approval; doesn't count in actuals yet.
    ADD COLUMN status text NOT NULL DEFAULT 'confirmed'
        CHECK (status IN ('pending', 'confirmed')),
    ADD COLUMN recurring_transaction_id uuid,
    ADD COLUMN scheduled_on date,
    ADD COLUMN satisfies_checklist boolean NOT NULL DEFAULT false,
    ADD CONSTRAINT transactions_recurring_fk FOREIGN KEY (recurring_transaction_id, user_id)
        REFERENCES finance.recurring_transactions (id, user_id),
    ADD CONSTRAINT transactions_recurring_scheduled_check
        CHECK ((recurring_transaction_id IS NULL) = (scheduled_on IS NULL));

-- One transaction per rule per occurrence, ever: deliberately NOT limited to undeleted
-- rows, so a rejected or deleted occurrence is never generated again.
CREATE UNIQUE INDEX transactions_recurring_occurrence_key
    ON finance.transactions (recurring_transaction_id, scheduled_on)
    WHERE recurring_transaction_id IS NOT NULL;

CREATE INDEX transactions_pending_idx ON finance.transactions (user_id)
    WHERE status = 'pending' AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- For the hourly job: which users have active rules (crosses users, so it bypasses RLS
-- and returns only ids and timezones). The job then works per user under RLS.
-- ---------------------------------------------------------------------------

CREATE FUNCTION finance.users_with_recurring() RETURNS TABLE (user_id uuid, timezone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, core, finance AS $$
    SELECT DISTINCT u.id, u.timezone
    FROM finance.recurring_transactions r
    JOIN core.users u ON u.id = r.user_id AND u.deleted_at IS NULL
    WHERE r.deleted_at IS NULL AND r.paused_at IS NULL
$$;

REVOKE ALL ON FUNCTION finance.users_with_recurring() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.users_with_recurring() TO disci_app;

-- Grants for the new table come from the schema's default privileges.

-- migrate:down

DROP FUNCTION finance.users_with_recurring();
DROP INDEX finance.transactions_pending_idx;
DROP INDEX finance.transactions_recurring_occurrence_key;
ALTER TABLE finance.transactions
    DROP CONSTRAINT transactions_recurring_scheduled_check,
    DROP CONSTRAINT transactions_recurring_fk,
    DROP COLUMN satisfies_checklist,
    DROP COLUMN scheduled_on,
    DROP COLUMN recurring_transaction_id,
    DROP COLUMN status;
DROP TABLE finance.recurring_transactions;
ALTER TABLE finance.budget_items
    DROP CONSTRAINT budget_items_checklist_check,
    DROP COLUMN checklist_day,
    DROP COLUMN is_checklist_item;
ALTER TABLE finance.budget_categories DROP COLUMN description;
