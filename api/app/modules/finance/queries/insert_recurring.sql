INSERT INTO finance.recurring_transactions
    (user_id, kind, name, item_name, category_id, amount, payee, notes, frequency, day_of_week,
     day_of_month, starts_on, ends_on, auto_apply)
VALUES (%(user_id)s, %(kind)s, %(name)s, %(item_name)s, %(category_id)s, %(amount)s, %(payee)s,
        %(notes)s, %(frequency)s, %(day_of_week)s, %(day_of_month)s, %(starts_on)s, %(ends_on)s,
        %(auto_apply)s)
RETURNING id
