-- migrate:up

-- Maps a Cognito sub to an existing user, without creating one. Used for MCP requests:
-- their access tokens carry no email, so they can't create the core.users row (only a
-- web sign-in, via core.ensure_user, does). SECURITY DEFINER for the same reason as
-- ensure_user: it runs before app.user_id is known.
CREATE FUNCTION core.find_user(p_cognito_sub text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, core AS $$
    SELECT id FROM core.users WHERE cognito_sub = p_cognito_sub AND deleted_at IS NULL
$$;

REVOKE ALL ON FUNCTION core.find_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.find_user(text) TO disci_app;

-- migrate:down

DROP FUNCTION core.find_user(text);
