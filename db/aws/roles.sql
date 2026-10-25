-- PRODUCTION (RDS): roles the app needs. The migrator Lambda runs this as the master
-- user (`disci`, the schema owner) before migrations on every deploy. Idempotent.
-- Local equivalent: db/local/roles.sql.

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'disci_app') THEN
        CREATE ROLE disci_app NOLOGIN;
    END IF;
    -- The API's login. No password: it can only sign in with an IAM auth token.
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'disci_api') THEN
        CREATE ROLE disci_api LOGIN;
    END IF;
END
$$;

GRANT disci_app TO disci_api;
GRANT rds_iam TO disci_api;
