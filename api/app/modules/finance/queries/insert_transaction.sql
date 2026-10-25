INSERT INTO finance.transactions (user_id, kind, amount, occurred_on, payee, description, notes)
VALUES (%(user_id)s, %(kind)s, %(amount)s, %(occurred_on)s, %(payee)s, %(description)s, %(notes)s)
RETURNING id, kind, amount, occurred_on, payee, description, notes, status, recurring_transaction_id
