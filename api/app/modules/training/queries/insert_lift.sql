INSERT INTO training.lifts (user_id, name, description)
VALUES (%(user_id)s, %(name)s, %(description)s)
RETURNING id
