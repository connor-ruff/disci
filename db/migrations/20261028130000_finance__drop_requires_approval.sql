-- migrate:up

-- Finance: drop the retired requires_approval flag. See docs/db/finance.md.
--
-- Contract step. 20261028120000_finance__fold_requires_approval.sql folded it into
-- auto_apply (so it's false on every rule), and the code deployed with it no longer
-- reads or writes the column.

ALTER TABLE finance.recurring_transactions DROP COLUMN requires_approval;

-- migrate:down

-- Every rule had it false, so re-adding it with that default restores the old state.
ALTER TABLE finance.recurring_transactions
    ADD COLUMN requires_approval boolean NOT NULL DEFAULT false;
