-- migrate:up

-- Finance: recurring rules target a budget item by name, and the Inbox becomes a table of
-- entries (decisions to make, plus a ledger of what was applied automatically).
-- See docs/db/finance.md.
--
-- Expand step only: nothing existing is rewritten or dropped. The `requires_approval`
-- column stays; the code now treats a rule with it on as "auto-apply off" and writes it as
-- false on save. A later contract migration folds it into auto_apply and drops it.

-- ---------------------------------------------------------------------------
-- The budget item a rule's transactions are meant for (free text, matched by name)
-- ---------------------------------------------------------------------------

ALTER TABLE finance.recurring_transactions ADD COLUMN item_name text;
-- Until now the rule's name was the item it matched, so existing rules keep matching.
-- The trigger is off so the backfill doesn't bump every rule's updated_at.
ALTER TABLE finance.recurring_transactions DISABLE TRIGGER set_updated_at;
UPDATE finance.recurring_transactions SET item_name = name;
ALTER TABLE finance.recurring_transactions ENABLE TRIGGER set_updated_at;
ALTER TABLE finance.recurring_transactions
    ALTER COLUMN item_name SET NOT NULL,
    ADD CONSTRAINT recurring_transactions_item_name_check CHECK (length(trim(item_name)) > 0);

-- ---------------------------------------------------------------------------
-- finance.inbox_entries
-- ---------------------------------------------------------------------------

-- One row per thing the Inbox shows about a transaction from a recurring rule:
--   applied   - auto-applied to budget_item_id in budget_id (the ledger; seen_at = read)
--   pick_item - auto-apply found no matching item in budget_id; the user picks one
--   place     - auto-apply off, or no budget covered the date; the user approves the
--               transaction (amount) and picks where it counts. Its transaction is pending.
-- Entries are resolved, never deleted, so there's no deleted_at.
CREATE TABLE finance.inbox_entries (
    id             uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id        uuid        NOT NULL REFERENCES core.users (id),
    transaction_id uuid        NOT NULL,
    kind           text        NOT NULL CHECK (kind IN ('applied', 'pick_item', 'place')),
    budget_id      uuid,
    -- applied: where it landed. pick_item: what the user picked, once resolved.
    budget_item_id uuid,
    -- NULL = open. Ledger entries are never open or resolved.
    resolution     text        CHECK (resolution IN ('done', 'skipped', 'rejected')),
    resolved_at    timestamptz,
    seen_at        timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (transaction_id, user_id) REFERENCES finance.transactions (id, user_id),
    FOREIGN KEY (budget_id, user_id) REFERENCES finance.budgets (id, user_id),
    FOREIGN KEY (budget_item_id, user_id) REFERENCES finance.budget_items (id, user_id),
    CHECK ((kind = 'place') = (budget_id IS NULL)),
    CHECK (kind <> 'applied' OR (budget_item_id IS NOT NULL AND resolution IS NULL)),
    CHECK ((resolution IS NULL) = (resolved_at IS NULL))
);

CREATE INDEX inbox_entries_open_idx ON finance.inbox_entries (user_id, created_at)
    WHERE kind <> 'applied' AND resolution IS NULL;
CREATE INDEX inbox_entries_ledger_idx ON finance.inbox_entries (user_id, created_at DESC)
    WHERE kind = 'applied';
CREATE INDEX inbox_entries_transaction_idx ON finance.inbox_entries (transaction_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.inbox_entries
    FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
ALTER TABLE finance.inbox_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner ON finance.inbox_entries TO disci_app
    USING (user_id = core.current_user_id())
    WITH CHECK (user_id = core.current_user_id());

-- Grants for the new table come from the schema's default privileges.

-- Transactions already awaiting approval become "place" entries. Their transactions
-- (and any allocations they have) are left exactly as they are.
INSERT INTO finance.inbox_entries (user_id, transaction_id, kind, created_at)
SELECT user_id, id, 'place', created_at
FROM finance.transactions
WHERE status = 'pending' AND deleted_at IS NULL;

-- migrate:down

DROP TABLE finance.inbox_entries;
ALTER TABLE finance.recurring_transactions
    DROP CONSTRAINT recurring_transactions_item_name_check,
    DROP COLUMN item_name;
