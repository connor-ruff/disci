INSERT INTO finance.transactions
    (user_id, kind, amount, occurred_on, payee, description, notes, satisfies_checklist)
VALUES (%(user_id)s, %(kind)s, %(amount)s, %(occurred_on)s, %(payee)s, %(description)s,
        %(notes)s, %(satisfies_checklist)s)
RETURNING id, kind, amount, occurred_on, payee, description, notes, status, satisfies_checklist,
          recurring_transaction_id
