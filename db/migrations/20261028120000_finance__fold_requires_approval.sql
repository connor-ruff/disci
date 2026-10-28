-- migrate:up

-- Finance: fold the retired requires_approval flag into auto_apply. See docs/db/finance.md.
--
-- Since 20261027200000_finance__inbox_entries.sql the code has read
-- `auto_apply AND NOT requires_approval` as a rule's auto-apply. This writes that result
-- into auto_apply itself, so the code can read auto_apply alone. Every rule reads the same
-- before and after, under both the live code and the new code. Dropping the column is a
-- later migration, once no deployed code mentions it.

-- The trigger is off so the fold doesn't bump these rules' updated_at.
ALTER TABLE finance.recurring_transactions DISABLE TRIGGER set_updated_at;
UPDATE finance.recurring_transactions
SET auto_apply = false, requires_approval = false
WHERE requires_approval;
ALTER TABLE finance.recurring_transactions ENABLE TRIGGER set_updated_at;

-- migrate:down

-- Nothing to undo: no schema changed, and the rules read the same either way.
