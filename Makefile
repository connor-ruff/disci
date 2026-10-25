# Local development commands. Run `make help` for the list.

COMPOSE := docker compose
DBMATE  := $(COMPOSE) run --rm dbmate
PSQL    := $(COMPOSE) exec -T db psql -U disci -d disci -v ON_ERROR_STOP=1

# The test database lives in the same local Postgres, separate from your dev data.
TEST_DB_URL := postgres://disci:disci@db:5432/disci_test?sslmode=disable

# How the API runs locally: as the disci_api role (RLS applies), with dev auth.
API_ENV := DISCI_ENV=local DISCI_AUTH_MODE=dev \
	DISCI_DATABASE_URL=postgresql://disci_api:disci_api@localhost:5432/disci

.DEFAULT_GOAL := help
.PHONY: help db-up db-down db-roles db-migrate db-rollback db-status db-new db-seed db-reset \
	db-psql db-test-prepare api-install api api-test api-lint

help: ## List available commands
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# --- Database ----------------------------------------------------------------

db-up: ## Start local Postgres (data persists between runs)
	$(COMPOSE) up -d --wait db

db-down: ## Stop local Postgres (data is kept)
	$(COMPOSE) stop db

db-roles: db-up
	@$(PSQL) -q < db/local/roles.sql

db-migrate: db-roles ## Apply pending migrations and refresh db/schema.sql
	$(DBMATE) up

db-rollback: db-up ## Roll back the most recent migration
	$(DBMATE) rollback

db-status: db-up ## Show which migrations have been applied
	$(DBMATE) status

db-new: ## Create a migration: make db-new name=finance__create_budgets
	@test -n "$(name)" || (echo 'usage: make db-new name=<module>__<description>' && exit 1)
	$(DBMATE) new $(name)

db-seed: db-up ## Load fake dev data (local only, never prod)
	$(PSQL) < db/seeds/dev.sql

db-reset: ## Wipe the local database, re-run all migrations, re-seed
	$(COMPOSE) down -v
	$(MAKE) db-migrate db-seed

db-psql: db-up ## Open a psql shell on the local database
	$(COMPOSE) exec db psql -U disci -d disci

db-test-prepare: db-roles
	@$(COMPOSE) run --rm -e DATABASE_URL='$(TEST_DB_URL)' dbmate --no-dump-schema drop >/dev/null
	@$(COMPOSE) run --rm -e DATABASE_URL='$(TEST_DB_URL)' dbmate --no-dump-schema up >/dev/null

# --- API ---------------------------------------------------------------------

api-install: ## Install API dependencies
	cd api && uv sync

api: db-migrate ## Run the API locally with auto-reload (http://localhost:8000/docs)
	cd api && $(API_ENV) uv run uvicorn app.main:app --reload --port 8000

api-test: db-test-prepare ## Run API tests against a fresh test database
	cd api && uv run pytest

api-lint: ## Lint and format-check the API
	cd api && uv run ruff check . && uv run ruff format --check .
