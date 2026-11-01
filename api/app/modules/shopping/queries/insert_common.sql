INSERT INTO shopping.common_items (user_id, shopping_type_id, name, notes)
VALUES (%(user_id)s, %(shopping_type_id)s, %(name)s, %(notes)s)
RETURNING id
