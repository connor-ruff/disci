\restrict dbmate

-- Dumped from database version 18.6 (Debian 18.6-1.pgdg13+2)
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: core; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA core;


--
-- Name: current_user_id(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.current_user_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
    SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;


--
-- Name: ensure_user(text, text); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.ensure_user(p_cognito_sub text, p_email text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'core'
    AS $$
DECLARE
    v_id uuid;
BEGIN
    SELECT id INTO v_id FROM core.users
    WHERE cognito_sub = p_cognito_sub AND deleted_at IS NULL;

    IF v_id IS NULL THEN
        INSERT INTO core.users (cognito_sub, email)
        VALUES (p_cognito_sub, p_email)
        ON CONFLICT (cognito_sub) WHERE deleted_at IS NULL DO NOTHING
        RETURNING id INTO v_id;

        -- Lost a race with a concurrent first request; the row exists now.
        IF v_id IS NULL THEN
            SELECT id INTO v_id FROM core.users
            WHERE cognito_sub = p_cognito_sub AND deleted_at IS NULL;
        END IF;
    END IF;

    RETURN v_id;
END
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: user_modules; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.user_modules (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id uuid NOT NULL,
    module_key text NOT NULL,
    enabled_at timestamp with time zone DEFAULT now() NOT NULL,
    disabled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT user_modules_module_key_check CHECK ((module_key = ANY (ARRAY['finance'::text, 'tasks'::text, 'nutrition'::text])))
);


--
-- Name: users; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.users (
    id uuid DEFAULT uuidv7() NOT NULL,
    cognito_sub text NOT NULL,
    email text NOT NULL,
    display_name text,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    week_starts_on smallint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT users_week_starts_on_check CHECK (((week_starts_on >= 1) AND (week_starts_on <= 7)))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: user_modules user_modules_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_modules
    ADD CONSTRAINT user_modules_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: user_modules_user_module_key; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX user_modules_user_module_key ON core.user_modules USING btree (user_id, module_key) WHERE (deleted_at IS NULL);


--
-- Name: users_cognito_sub_key; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX users_cognito_sub_key ON core.users USING btree (cognito_sub) WHERE (deleted_at IS NULL);


--
-- Name: users_email_key; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON core.users USING btree (lower(email)) WHERE (deleted_at IS NULL);


--
-- Name: user_modules set_updated_at; Type: TRIGGER; Schema: core; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON core.user_modules FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: users set_updated_at; Type: TRIGGER; Schema: core; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON core.users FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: user_modules user_modules_user_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_modules
    ADD CONSTRAINT user_modules_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id);


--
-- Name: user_modules; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.user_modules ENABLE ROW LEVEL SECURITY;

--
-- Name: user_modules user_modules_owner; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY user_modules_owner ON core.user_modules TO disci_app USING ((user_id = core.current_user_id())) WITH CHECK ((user_id = core.current_user_id()));


--
-- Name: users; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_self; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY users_self ON core.users TO disci_app USING ((id = core.current_user_id())) WITH CHECK ((id = core.current_user_id()));


--
-- PostgreSQL database dump complete
--

\unrestrict dbmate


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('20261025134012');
