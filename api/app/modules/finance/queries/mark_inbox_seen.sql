UPDATE finance.inbox_entries SET seen_at = now()
WHERE kind = 'applied' AND seen_at IS NULL
