-- LOCAL ONLY: login role the API connects as. It is a member of disci_app but does
-- not own any tables, so row-level security applies to it. (The table owner, `disci`,
-- bypasses RLS, which is why the API never connects as it.)
-- Production creates its own equivalent with RDS IAM auth and no password.
-- Idempotent; `make db-migrate` runs it every time.

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'disci_app') THEN
        CREATE ROLE disci_app NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'disci_api') THEN
        CREATE ROLE disci_api LOGIN PASSWORD 'disci_api';
    END IF;
END
$$;

GRANT disci_app TO disci_api;
