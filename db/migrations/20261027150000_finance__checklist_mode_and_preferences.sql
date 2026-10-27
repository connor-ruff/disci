-- migrate:up

-- Finance: how a checklist item counts as done, and per-user display preferences.
-- See docs/db/finance.md.

-- ---------------------------------------------------------------------------
-- Checklist mode on budget items
-- ---------------------------------------------------------------------------

-- full_amount: done once the confirmed actual reaches the planned amount (the old rule).
-- any_payment: done once anything has been paid, for bills that vary (utilities).
-- Meaningless on non-checklist items, so it keeps its default there.
ALTER TABLE finance.budget_items
    ADD COLUMN checklist_mode text NOT NULL DEFAULT 'full_amount'
        CHECK (checklist_mode IN ('full_amount', 'any_payment'));

-- ---------------------------------------------------------------------------
-- finance.preferences: display settings (one row per user, upserted on save)
-- ---------------------------------------------------------------------------

CREATE TABLE finance.preferences (
    id                   uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id              uuid        NOT NULL UNIQUE REFERENCES core.users (id),
    -- "$x of $y" beside each category heading on a budget page.
    show_category_totals boolean     NOT NULL DEFAULT false,
    -- The same beside the Income and Expenses headings.
    show_kind_totals     boolean     NOT NULL DEFAULT false,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.preferences
    FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
ALTER TABLE finance.preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner ON finance.preferences TO disci_app
    USING (user_id = core.current_user_id())
    WITH CHECK (user_id = core.current_user_id());

-- Grants for the new table come from the schema's default privileges.

-- migrate:down

DROP TABLE finance.preferences;
ALTER TABLE finance.budget_items DROP COLUMN checklist_mode;
