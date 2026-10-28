UPDATE finance.recurring_transactions
SET kind = %(kind)s, name = %(name)s, item_name = %(item_name)s, category_id = %(category_id)s,
    amount = %(amount)s, payee = %(payee)s, notes = %(notes)s, frequency = %(frequency)s,
    day_of_week = %(day_of_week)s, day_of_month = %(day_of_month)s, starts_on = %(starts_on)s,
    ends_on = %(ends_on)s, auto_apply = %(auto_apply)s,
    paused_at = CASE WHEN %(paused)s THEN coalesce(paused_at, now()) END
WHERE id = %(recurring_id)s AND deleted_at IS NULL
RETURNING id
