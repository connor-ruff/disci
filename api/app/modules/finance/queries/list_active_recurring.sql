-- Rules due for generation, with the date each was created in the user's timezone
-- (rules never generate occurrences before they existed).
SELECT r.id, r.kind, r.name, r.category_id, r.amount, r.payee, r.notes, r.frequency,
       r.day_of_week, r.day_of_month, r.starts_on, r.ends_on, r.auto_apply,
       r.requires_approval, r.satisfies_checklist,
       (r.created_at AT TIME ZONE %(timezone)s)::date AS created_on
FROM finance.recurring_transactions r
WHERE r.deleted_at IS NULL AND r.paused_at IS NULL
