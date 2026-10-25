-- migrate:up

-- Contract step: the per-transaction / per-rule "satisfies checklist" flag was replaced by
-- a strict rule (a checklist item is done once its confirmed actual reaches the plan).
-- The code stopped reading these columns in the previous release, so they can go.

ALTER TABLE finance.transactions DROP COLUMN satisfies_checklist;
ALTER TABLE finance.recurring_transactions DROP COLUMN satisfies_checklist;

-- migrate:down

ALTER TABLE finance.recurring_transactions
    ADD COLUMN satisfies_checklist boolean NOT NULL DEFAULT false;
ALTER TABLE finance.transactions
    ADD COLUMN satisfies_checklist boolean NOT NULL DEFAULT false;
