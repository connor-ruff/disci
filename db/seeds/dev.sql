-- Fake data for LOCAL DEVELOPMENT ONLY. Never run against production.
-- Safe to re-run: every insert skips rows that already exist.

-- A stand-in user for working on the API before Cognito login is wired up.
-- Signing in through Cognito creates your real user row separately.
INSERT INTO core.users (cognito_sub, email, display_name, timezone)
VALUES ('local-dev-user', 'dev@disci.local', 'Local Dev', 'America/Chicago')
ON CONFLICT (cognito_sub) WHERE deleted_at IS NULL DO NOTHING;

INSERT INTO core.user_modules (user_id, module_key)
SELECT id, 'finance' FROM core.users WHERE cognito_sub = 'local-dev-user'
ON CONFLICT (user_id, module_key) WHERE deleted_at IS NULL DO NOTHING;
