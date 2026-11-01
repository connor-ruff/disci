-- Saving a list item as a common item: one that already exists is left as it is.
INSERT INTO shopping.common_items (user_id, shopping_type_id, name, notes)
VALUES (%(user_id)s, %(shopping_type_id)s, %(name)s, %(notes)s)
ON CONFLICT DO NOTHING
