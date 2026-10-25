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
-- Name: finance; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA finance;


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
-- Name: budget_categories; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.budget_categories (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    name text NOT NULL,
    color text,
    icon text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT budget_categories_kind_check CHECK ((kind = ANY (ARRAY['expense'::text, 'income'::text]))),
    CONSTRAINT budget_categories_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0))
);


--
-- Name: budget_items; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.budget_items (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id uuid NOT NULL,
    budget_id uuid NOT NULL,
    kind text NOT NULL,
    category_id uuid,
    name text NOT NULL,
    planned_amount numeric(12,2) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT budget_items_kind_check CHECK ((kind = ANY (ARRAY['expense'::text, 'income'::text]))),
    CONSTRAINT budget_items_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0)),
    CONSTRAINT budget_items_planned_amount_check CHECK ((planned_amount >= (0)::numeric))
);


--
-- Name: budgets; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.budgets (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    period_type text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT budgets_check CHECK ((period_end >= period_start)),
    CONSTRAINT budgets_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0)),
    CONSTRAINT budgets_period_type_check CHECK ((period_type = ANY (ARRAY['week'::text, 'month'::text, 'year'::text])))
);


--
-- Name: transaction_allocations; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.transaction_allocations (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id uuid NOT NULL,
    transaction_id uuid NOT NULL,
    budget_item_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT transaction_allocations_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: transactions; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.transactions (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    amount numeric(12,2) NOT NULL,
    occurred_on date NOT NULL,
    payee text,
    description text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT transactions_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT transactions_kind_check CHECK ((kind = ANY (ARRAY['expense'::text, 'income'::text])))
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
-- Name: budget_categories budget_categories_id_kind_user_id_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.budget_categories
    ADD CONSTRAINT budget_categories_id_kind_user_id_key UNIQUE (id, kind, user_id);


--
-- Name: budget_categories budget_categories_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.budget_categories
    ADD CONSTRAINT budget_categories_pkey PRIMARY KEY (id);


--
-- Name: budget_items budget_items_id_user_id_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.budget_items
    ADD CONSTRAINT budget_items_id_user_id_key UNIQUE (id, user_id);


--
-- Name: budget_items budget_items_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.budget_items
    ADD CONSTRAINT budget_items_pkey PRIMARY KEY (id);


--
-- Name: budgets budgets_id_user_id_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.budgets
    ADD CONSTRAINT budgets_id_user_id_key UNIQUE (id, user_id);


--
-- Name: budgets budgets_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.budgets
    ADD CONSTRAINT budgets_pkey PRIMARY KEY (id);


--
-- Name: transaction_allocations transaction_allocations_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transaction_allocations
    ADD CONSTRAINT transaction_allocations_pkey PRIMARY KEY (id);


--
-- Name: transaction_allocations transaction_allocations_transaction_id_budget_item_id_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transaction_allocations
    ADD CONSTRAINT transaction_allocations_transaction_id_budget_item_id_key UNIQUE (transaction_id, budget_item_id);


--
-- Name: transactions transactions_id_user_id_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transactions
    ADD CONSTRAINT transactions_id_user_id_key UNIQUE (id, user_id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


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
-- Name: budget_categories_name_key; Type: INDEX; Schema: finance; Owner: -
--

CREATE UNIQUE INDEX budget_categories_name_key ON finance.budget_categories USING btree (user_id, kind, lower(name)) WHERE (deleted_at IS NULL);


--
-- Name: budget_items_budget_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX budget_items_budget_idx ON finance.budget_items USING btree (budget_id) WHERE (deleted_at IS NULL);


--
-- Name: budget_items_category_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX budget_items_category_idx ON finance.budget_items USING btree (category_id) WHERE (category_id IS NOT NULL);


--
-- Name: budgets_user_period_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX budgets_user_period_idx ON finance.budgets USING btree (user_id, period_start DESC);


--
-- Name: transaction_allocations_item_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX transaction_allocations_item_idx ON finance.transaction_allocations USING btree (budget_item_id);


--
-- Name: transactions_user_date_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX transactions_user_date_idx ON finance.transactions USING btree (user_id, occurred_on DESC);


--
-- Name: user_modules set_updated_at; Type: TRIGGER; Schema: core; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON core.user_modules FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: users set_updated_at; Type: TRIGGER; Schema: core; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON core.users FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: budget_categories set_updated_at; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.budget_categories FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: budget_items set_updated_at; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.budget_items FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: budgets set_updated_at; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.budgets FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: transaction_allocations set_updated_at; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.transaction_allocations FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: transactions set_updated_at; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.transactions FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: user_modules user_modules_user_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_modules
    ADD CONSTRAINT user_modules_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id);


--
-- Name: budget_categories budget_categories_user_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.budget_categories
    ADD CONSTRAINT budget_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id);


--
-- Name: budget_items budget_items_budget_id_user_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.budget_items
    ADD CONSTRAINT budget_items_budget_id_user_id_fkey FOREIGN KEY (budget_id, user_id) REFERENCES finance.budgets(id, user_id);


--
-- Name: budget_items budget_items_category_id_kind_user_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.budget_items
    ADD CONSTRAINT budget_items_category_id_kind_user_id_fkey FOREIGN KEY (category_id, kind, user_id) REFERENCES finance.budget_categories(id, kind, user_id);


--
-- Name: budget_items budget_items_user_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.budget_items
    ADD CONSTRAINT budget_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id);


--
-- Name: budgets budgets_user_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.budgets
    ADD CONSTRAINT budgets_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id);


--
-- Name: transaction_allocations transaction_allocations_budget_item_id_user_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transaction_allocations
    ADD CONSTRAINT transaction_allocations_budget_item_id_user_id_fkey FOREIGN KEY (budget_item_id, user_id) REFERENCES finance.budget_items(id, user_id);


--
-- Name: transaction_allocations transaction_allocations_transaction_id_user_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transaction_allocations
    ADD CONSTRAINT transaction_allocations_transaction_id_user_id_fkey FOREIGN KEY (transaction_id, user_id) REFERENCES finance.transactions(id, user_id);


--
-- Name: transaction_allocations transaction_allocations_user_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transaction_allocations
    ADD CONSTRAINT transaction_allocations_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id);


--
-- Name: transactions transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transactions
    ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id);


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
-- Name: budget_categories; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.budget_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: budget_items; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.budget_items ENABLE ROW LEVEL SECURITY;

--
-- Name: budgets; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.budgets ENABLE ROW LEVEL SECURITY;

--
-- Name: budget_categories owner; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY owner ON finance.budget_categories TO disci_app USING ((user_id = core.current_user_id())) WITH CHECK ((user_id = core.current_user_id()));


--
-- Name: budget_items owner; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY owner ON finance.budget_items TO disci_app USING ((user_id = core.current_user_id())) WITH CHECK ((user_id = core.current_user_id()));


--
-- Name: budgets owner; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY owner ON finance.budgets TO disci_app USING ((user_id = core.current_user_id())) WITH CHECK ((user_id = core.current_user_id()));


--
-- Name: transaction_allocations owner; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY owner ON finance.transaction_allocations TO disci_app USING ((user_id = core.current_user_id())) WITH CHECK ((user_id = core.current_user_id()));


--
-- Name: transactions owner; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY owner ON finance.transactions TO disci_app USING ((user_id = core.current_user_id())) WITH CHECK ((user_id = core.current_user_id()));


--
-- Name: transaction_allocations; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.transaction_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.transactions ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict dbmate


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('20261025134012'),
    ('20261025150312');
