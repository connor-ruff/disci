INSERT INTO finance.transaction_allocations (user_id, transaction_id, budget_item_id, amount)
VALUES (%(user_id)s, %(transaction_id)s, %(budget_item_id)s, %(amount)s)
