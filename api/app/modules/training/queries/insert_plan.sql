INSERT INTO training.plans
    (user_id, name, race_name, race_on, starts_on, is_active, count_walk_miles, cross_train_at_pct)
VALUES
    (%(user_id)s, %(name)s, %(race_name)s, %(race_on)s, %(starts_on)s, %(is_active)s,
     %(count_walk_miles)s, %(cross_train_at_pct)s)
RETURNING id
