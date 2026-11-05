-- migrate:up

-- Let users turn on the Training module (see docs/db/training.md).
ALTER TABLE core.user_modules DROP CONSTRAINT user_modules_module_key_check;
ALTER TABLE core.user_modules ADD CONSTRAINT user_modules_module_key_check
    CHECK (module_key IN ('finance', 'tasks', 'nutrition', 'shopping', 'training'));

-- migrate:down

DELETE FROM core.user_modules WHERE module_key = 'training';
ALTER TABLE core.user_modules DROP CONSTRAINT user_modules_module_key_check;
ALTER TABLE core.user_modules ADD CONSTRAINT user_modules_module_key_check
    CHECK (module_key IN ('finance', 'tasks', 'nutrition', 'shopping'));
