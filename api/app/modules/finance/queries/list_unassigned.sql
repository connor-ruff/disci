-- Confirmed transactions that don't count toward any budget item yet.
SELECT t.id, t.kind, t.amount, t.occurred_on, t.payee, t.description, t.notes, t.status,
       t.satisfies_checklist, t.recurring_transaction_id, r.name AS recurring_name
FROM finance.transactions t
LEFT JOIN finance.recurring_transactions r ON r.id = t.recurring_transaction_id
WHERE t.status = 'confirmed' AND t.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT FROM finance.transaction_allocations a
      JOIN finance.budget_items i ON i.id = a.budget_item_id AND i.deleted_at IS NULL
      WHERE a.transaction_id = t.id
  )
ORDER BY t.occurred_on DESC, t.created_at DESC
