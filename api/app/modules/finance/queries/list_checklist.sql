-- Checklist items in the user's monthly budget(s) covering today. An item is done once
-- something confirmed has been logged and, in full_amount mode, its net actual reaches
-- the planned amount.
SELECT *, (actual_amount > 0 AND (checklist_mode = 'any_payment' OR actual_amount >= planned_amount))
              AS done
FROM (
    SELECT
        b.id AS budget_id, b.name AS budget_name, i.id AS item_id, i.name AS item_name, i.kind,
        i.checklist_day, i.checklist_mode, i.planned_amount,
        (b.period_start + (i.checklist_day - 1))::date AS due_on,
        coalesce(
            sum(CASE WHEN t.kind = i.kind THEN a.amount ELSE -a.amount END)
                FILTER (WHERE t.status = 'confirmed'),
            0
        )::numeric(12,2) AS actual_amount,
        max(t.occurred_on) FILTER (WHERE t.status = 'confirmed') AS last_payment_on
    FROM finance.budgets b
    JOIN finance.budget_items i
        ON i.budget_id = b.id AND i.deleted_at IS NULL AND i.is_checklist_item
    LEFT JOIN finance.transaction_allocations a ON a.budget_item_id = i.id
    LEFT JOIN finance.transactions t ON t.id = a.transaction_id AND t.deleted_at IS NULL
    WHERE b.deleted_at IS NULL AND b.period_type = 'month'
      AND %(today)s BETWEEN b.period_start AND b.period_end
    GROUP BY b.id, i.id
) items
ORDER BY checklist_day, lower(item_name)
