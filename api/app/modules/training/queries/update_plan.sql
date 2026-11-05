UPDATE training.plans
SET name = %(name)s,
    race_name = %(race_name)s,
    race_on = %(race_on)s,
    starts_on = %(starts_on)s,
    count_walk_miles = %(count_walk_miles)s,
    cross_train_at_pct = %(cross_train_at_pct)s
WHERE id = %(plan_id)s AND deleted_at IS NULL
RETURNING id
