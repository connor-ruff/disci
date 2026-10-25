-- Equivalent to SET LOCAL app.user_id = ..., but accepts a bound parameter.
SELECT set_config('app.user_id', %(user_id)s, true)
