INSERT INTO finance.transactions (user_id, kind, amount, occurred_on, payee, description)
VALUES (%(user_id)s, %(kind)s, %(amount)s, %(occurred_on)s, %(payee)s, %(description)s)
RETURNING id, kind, amount, occurred_on, payee, description
