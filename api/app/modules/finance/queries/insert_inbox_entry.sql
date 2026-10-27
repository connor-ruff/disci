INSERT INTO finance.inbox_entries (user_id, transaction_id, kind, budget_id, budget_item_id)
VALUES (%(user_id)s, %(transaction_id)s, %(kind)s, %(budget_id)s, %(budget_item_id)s)
