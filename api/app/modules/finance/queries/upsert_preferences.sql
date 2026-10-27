INSERT INTO finance.preferences (user_id, show_category_totals, show_kind_totals)
VALUES (%(user_id)s, %(show_category_totals)s, %(show_kind_totals)s)
ON CONFLICT (user_id) DO UPDATE
SET show_category_totals = EXCLUDED.show_category_totals,
    show_kind_totals = EXCLUDED.show_kind_totals
RETURNING show_category_totals, show_kind_totals
