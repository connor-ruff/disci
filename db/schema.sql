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
-- Name: nutrition; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA nutrition;


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
-- Name: find_user(text); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.find_user(p_cognito_sub text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'core'
    AS $$
    SELECT id FROM core.users WHERE cognito_sub = p_cognito_sub AND deleted_at IS NULL
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


--
-- Name: users_with_recurring(); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.users_with_recurring() RETURNS TABLE(user_id uuid, timezone text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'core', 'finance'
    AS $$
    SELECT DISTINCT u.id, u.timezone
    FROM finance.recurring_transactions r
    JOIN core.users u ON u.id = r.user_id AND u.deleted_at IS NULL
    WHERE r.deleted_at IS NULL AND r.paused_at IS NULL
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
    description text,
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
    is_checklist_item boolean DEFAULT false NOT NULL,
    checklist_day smallint,
    CONSTRAINT budget_items_checklist_check CHECK ((is_checklist_item = (checklist_day IS NOT NULL))),
    CONSTRAINT budget_items_checklist_day_check CHECK (((checklist_day >= 1) AND (checklist_day <= 28))),
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
-- Name: recurring_transactions; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.recurring_transactions (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    name text NOT NULL,
    category_id uuid,
    amount numeric(12,2) NOT NULL,
    payee text,
    notes text,
    frequency text NOT NULL,
    day_of_week smallint,
    day_of_month smallint,
    starts_on date NOT NULL,
    ends_on date,
    auto_apply boolean DEFAULT false NOT NULL,
    requires_approval boolean DEFAULT false NOT NULL,
    paused_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT recurring_transactions_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT recurring_transactions_check CHECK (((frequency = 'weekly'::text) = (day_of_week IS NOT NULL))),
    CONSTRAINT recurring_transactions_check1 CHECK (((frequency = 'monthly'::text) = (day_of_month IS NOT NULL))),
    CONSTRAINT recurring_transactions_check2 CHECK (((frequency <> 'quarterly'::text) OR (EXTRACT(day FROM starts_on) <= (28)::numeric))),
    CONSTRAINT recurring_transactions_check3 CHECK (((ends_on IS NULL) OR (ends_on >= starts_on))),
    CONSTRAINT recurring_transactions_day_of_month_check CHECK (((day_of_month >= 1) AND (day_of_month <= 28))),
    CONSTRAINT recurring_transactions_day_of_week_check CHECK (((day_of_week >= 1) AND (day_of_week <= 7))),
    CONSTRAINT recurring_transactions_frequency_check CHECK ((frequency = ANY (ARRAY['weekly'::text, 'monthly'::text, 'quarterly'::text, 'yearly'::text]))),
    CONSTRAINT recurring_transactions_kind_check CHECK ((kind = ANY (ARRAY['expense'::text, 'income'::text]))),
    CONSTRAINT recurring_transactions_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0))
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
    status text DEFAULT 'confirmed'::text NOT NULL,
    recurring_transaction_id uuid,
    scheduled_on date,
    CONSTRAINT transactions_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT transactions_kind_check CHECK ((kind = ANY (ARRAY['expense'::text, 'income'::text]))),
    CONSTRAINT transactions_recurring_scheduled_check CHECK (((recurring_transaction_id IS NULL) = (scheduled_on IS NULL))),
    CONSTRAINT transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text])))
);


--
-- Name: food_item_logs; Type: TABLE; Schema: nutrition; Owner: -
--

CREATE TABLE nutrition.food_item_logs (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id uuid NOT NULL,
    food_item_id uuid NOT NULL,
    eaten_on date NOT NULL,
    servings numeric(16,6) NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT food_item_logs_servings_check CHECK ((servings > (0)::numeric))
);


--
-- Name: food_items; Type: TABLE; Schema: nutrition; Owner: -
--

CREATE TABLE nutrition.food_items (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    standard_quantity numeric(16,6) NOT NULL,
    standard_unit text NOT NULL,
    calories numeric(16,6),
    protein_g numeric(16,6),
    total_fat_g numeric(16,6),
    saturated_fat_g numeric(16,6),
    trans_fat_g numeric(16,6),
    cholesterol_mg numeric(16,6),
    sodium_mg numeric(16,6),
    total_carbs_g numeric(16,6),
    fiber_g numeric(16,6),
    total_sugars_g numeric(16,6),
    added_sugars_g numeric(16,6),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT food_items_added_sugars_g_check CHECK ((added_sugars_g >= (0)::numeric)),
    CONSTRAINT food_items_calories_check CHECK ((calories >= (0)::numeric)),
    CONSTRAINT food_items_cholesterol_mg_check CHECK ((cholesterol_mg >= (0)::numeric)),
    CONSTRAINT food_items_fiber_g_check CHECK ((fiber_g >= (0)::numeric)),
    CONSTRAINT food_items_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0)),
    CONSTRAINT food_items_protein_g_check CHECK ((protein_g >= (0)::numeric)),
    CONSTRAINT food_items_saturated_fat_g_check CHECK ((saturated_fat_g >= (0)::numeric)),
    CONSTRAINT food_items_sodium_mg_check CHECK ((sodium_mg >= (0)::numeric)),
    CONSTRAINT food_items_standard_quantity_check CHECK ((standard_quantity > (0)::numeric)),
    CONSTRAINT food_items_standard_unit_check CHECK ((length(TRIM(BOTH FROM standard_unit)) > 0)),
    CONSTRAINT food_items_total_carbs_g_check CHECK ((total_carbs_g >= (0)::numeric)),
    CONSTRAINT food_items_total_fat_g_check CHECK ((total_fat_g >= (0)::numeric)),
    CONSTRAINT food_items_total_sugars_g_check CHECK ((total_sugars_g >= (0)::numeric)),
    CONSTRAINT food_items_trans_fat_g_check CHECK ((trans_fat_g >= (0)::numeric))
);


--
-- Name: macro_goals; Type: TABLE; Schema: nutrition; Owner: -
--

CREATE TABLE nutrition.macro_goals (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id uuid NOT NULL,
    nutrient text NOT NULL,
    kind text NOT NULL,
    amount numeric(10,2) NOT NULL,
    starts_on date NOT NULL,
    ends_on date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT macro_goals_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT macro_goals_check CHECK (((ends_on IS NULL) OR (ends_on >= starts_on))),
    CONSTRAINT macro_goals_kind_check CHECK ((kind = ANY (ARRAY['target'::text, 'limit'::text]))),
    CONSTRAINT macro_goals_nutrient_check CHECK ((nutrient = ANY (ARRAY['calories'::text, 'protein_g'::text, 'total_fat_g'::text, 'saturated_fat_g'::text, 'trans_fat_g'::text, 'cholesterol_mg'::text, 'sodium_mg'::text, 'total_carbs_g'::text, 'fiber_g'::text, 'total_sugars_g'::text, 'added_sugars_g'::text])))
);


--
-- Name: preferences; Type: TABLE; Schema: nutrition; Owner: -
--

CREATE TABLE nutrition.preferences (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id uuid NOT NULL,
    tracked_nutrients text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT preferences_tracked_nutrients_check CHECK ((tracked_nutrients <@ ARRAY['calories'::text, 'protein_g'::text, 'total_fat_g'::text, 'saturated_fat_g'::text, 'trans_fat_g'::text, 'cholesterol_mg'::text, 'sodium_mg'::text, 'total_carbs_g'::text, 'fiber_g'::text, 'total_sugars_g'::text, 'added_sugars_g'::text]))
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
-- Name: recurring_transactions recurring_transactions_id_user_id_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.recurring_transactions
    ADD CONSTRAINT recurring_transactions_id_user_id_key UNIQUE (id, user_id);


--
-- Name: recurring_transactions recurring_transactions_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.recurring_transactions
    ADD CONSTRAINT recurring_transactions_pkey PRIMARY KEY (id);


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
-- Name: food_item_logs food_item_logs_pkey; Type: CONSTRAINT; Schema: nutrition; Owner: -
--

ALTER TABLE ONLY nutrition.food_item_logs
    ADD CONSTRAINT food_item_logs_pkey PRIMARY KEY (id);


--
-- Name: food_items food_items_id_user_id_key; Type: CONSTRAINT; Schema: nutrition; Owner: -
--

ALTER TABLE ONLY nutrition.food_items
    ADD CONSTRAINT food_items_id_user_id_key UNIQUE (id, user_id);


--
-- Name: food_items food_items_pkey; Type: CONSTRAINT; Schema: nutrition; Owner: -
--

ALTER TABLE ONLY nutrition.food_items
    ADD CONSTRAINT food_items_pkey PRIMARY KEY (id);


--
-- Name: macro_goals macro_goals_pkey; Type: CONSTRAINT; Schema: nutrition; Owner: -
--

ALTER TABLE ONLY nutrition.macro_goals
    ADD CONSTRAINT macro_goals_pkey PRIMARY KEY (id);


--
-- Name: preferences preferences_pkey; Type: CONSTRAINT; Schema: nutrition; Owner: -
--

ALTER TABLE ONLY nutrition.preferences
    ADD CONSTRAINT preferences_pkey PRIMARY KEY (id);


--
-- Name: preferences preferences_user_id_key; Type: CONSTRAINT; Schema: nutrition; Owner: -
--

ALTER TABLE ONLY nutrition.preferences
    ADD CONSTRAINT preferences_user_id_key UNIQUE (user_id);


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
-- Name: transactions_pending_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX transactions_pending_idx ON finance.transactions USING btree (user_id) WHERE ((status = 'pending'::text) AND (deleted_at IS NULL));


--
-- Name: transactions_recurring_occurrence_key; Type: INDEX; Schema: finance; Owner: -
--

CREATE UNIQUE INDEX transactions_recurring_occurrence_key ON finance.transactions USING btree (recurring_transaction_id, scheduled_on) WHERE (recurring_transaction_id IS NOT NULL);


--
-- Name: transactions_user_date_idx; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX transactions_user_date_idx ON finance.transactions USING btree (user_id, occurred_on DESC);


--
-- Name: food_item_logs_food_idx; Type: INDEX; Schema: nutrition; Owner: -
--

CREATE INDEX food_item_logs_food_idx ON nutrition.food_item_logs USING btree (food_item_id);


--
-- Name: food_item_logs_user_day_idx; Type: INDEX; Schema: nutrition; Owner: -
--

CREATE INDEX food_item_logs_user_day_idx ON nutrition.food_item_logs USING btree (user_id, eaten_on DESC) WHERE (deleted_at IS NULL);


--
-- Name: food_items_name_key; Type: INDEX; Schema: nutrition; Owner: -
--

CREATE UNIQUE INDEX food_items_name_key ON nutrition.food_items USING btree (user_id, lower(name)) WHERE (deleted_at IS NULL);


--
-- Name: macro_goals_active_key; Type: INDEX; Schema: nutrition; Owner: -
--

CREATE UNIQUE INDEX macro_goals_active_key ON nutrition.macro_goals USING btree (user_id, nutrient, kind) WHERE ((ends_on IS NULL) AND (deleted_at IS NULL));


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
-- Name: recurring_transactions set_updated_at; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.recurring_transactions FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: transaction_allocations set_updated_at; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.transaction_allocations FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: transactions set_updated_at; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance.transactions FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: food_item_logs set_updated_at; Type: TRIGGER; Schema: nutrition; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON nutrition.food_item_logs FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: food_items set_updated_at; Type: TRIGGER; Schema: nutrition; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON nutrition.food_items FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: macro_goals set_updated_at; Type: TRIGGER; Schema: nutrition; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON nutrition.macro_goals FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


--
-- Name: preferences set_updated_at; Type: TRIGGER; Schema: nutrition; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON nutrition.preferences FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();


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
-- Name: recurring_transactions recurring_transactions_category_id_kind_user_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.recurring_transactions
    ADD CONSTRAINT recurring_transactions_category_id_kind_user_id_fkey FOREIGN KEY (category_id, kind, user_id) REFERENCES finance.budget_categories(id, kind, user_id);


--
-- Name: recurring_transactions recurring_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.recurring_transactions
    ADD CONSTRAINT recurring_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id);


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
-- Name: transactions transactions_recurring_fk; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transactions
    ADD CONSTRAINT transactions_recurring_fk FOREIGN KEY (recurring_transaction_id, user_id) REFERENCES finance.recurring_transactions(id, user_id);


--
-- Name: transactions transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.transactions
    ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id);


--
-- Name: food_item_logs food_item_logs_food_item_id_user_id_fkey; Type: FK CONSTRAINT; Schema: nutrition; Owner: -
--

ALTER TABLE ONLY nutrition.food_item_logs
    ADD CONSTRAINT food_item_logs_food_item_id_user_id_fkey FOREIGN KEY (food_item_id, user_id) REFERENCES nutrition.food_items(id, user_id);


--
-- Name: food_item_logs food_item_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: nutrition; Owner: -
--

ALTER TABLE ONLY nutrition.food_item_logs
    ADD CONSTRAINT food_item_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id);


--
-- Name: food_items food_items_user_id_fkey; Type: FK CONSTRAINT; Schema: nutrition; Owner: -
--

ALTER TABLE ONLY nutrition.food_items
    ADD CONSTRAINT food_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id);


--
-- Name: macro_goals macro_goals_user_id_fkey; Type: FK CONSTRAINT; Schema: nutrition; Owner: -
--

ALTER TABLE ONLY nutrition.macro_goals
    ADD CONSTRAINT macro_goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id);


--
-- Name: preferences preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: nutrition; Owner: -
--

ALTER TABLE ONLY nutrition.preferences
    ADD CONSTRAINT preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id);


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
-- Name: recurring_transactions owner; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY owner ON finance.recurring_transactions TO disci_app USING ((user_id = core.current_user_id())) WITH CHECK ((user_id = core.current_user_id()));


--
-- Name: transaction_allocations owner; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY owner ON finance.transaction_allocations TO disci_app USING ((user_id = core.current_user_id())) WITH CHECK ((user_id = core.current_user_id()));


--
-- Name: transactions owner; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY owner ON finance.transactions TO disci_app USING ((user_id = core.current_user_id())) WITH CHECK ((user_id = core.current_user_id()));


--
-- Name: recurring_transactions; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.recurring_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: transaction_allocations; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.transaction_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: food_item_logs; Type: ROW SECURITY; Schema: nutrition; Owner: -
--

ALTER TABLE nutrition.food_item_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: food_items; Type: ROW SECURITY; Schema: nutrition; Owner: -
--

ALTER TABLE nutrition.food_items ENABLE ROW LEVEL SECURITY;

--
-- Name: macro_goals; Type: ROW SECURITY; Schema: nutrition; Owner: -
--

ALTER TABLE nutrition.macro_goals ENABLE ROW LEVEL SECURITY;

--
-- Name: food_item_logs owner; Type: POLICY; Schema: nutrition; Owner: -
--

CREATE POLICY owner ON nutrition.food_item_logs TO disci_app USING ((user_id = core.current_user_id())) WITH CHECK ((user_id = core.current_user_id()));


--
-- Name: food_items owner; Type: POLICY; Schema: nutrition; Owner: -
--

CREATE POLICY owner ON nutrition.food_items TO disci_app USING ((user_id = core.current_user_id())) WITH CHECK ((user_id = core.current_user_id()));


--
-- Name: macro_goals owner; Type: POLICY; Schema: nutrition; Owner: -
--

CREATE POLICY owner ON nutrition.macro_goals TO disci_app USING ((user_id = core.current_user_id())) WITH CHECK ((user_id = core.current_user_id()));


--
-- Name: preferences owner; Type: POLICY; Schema: nutrition; Owner: -
--

CREATE POLICY owner ON nutrition.preferences TO disci_app USING ((user_id = core.current_user_id())) WITH CHECK ((user_id = core.current_user_id()));


--
-- Name: preferences; Type: ROW SECURITY; Schema: nutrition; Owner: -
--

ALTER TABLE nutrition.preferences ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict dbmate


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('20261025134012'),
    ('20261025150312'),
    ('20261025153025'),
    ('20261025155734'),
    ('20261025170608'),
    ('20261025190000'),
    ('20261026001500'),
    ('20261026170000');
