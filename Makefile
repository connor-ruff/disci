# Local development commands. Run `make help` for the list.

COMPOSE := docker compose
DBMATE  := $(COMPOSE) run --rm dbmate
PSQL    := $(COMPOSE) exec -T db psql -U disci -d disci -v ON_ERROR_STOP=1

.DEFAULT_GOAL := help
.PHONY: help db-up db-down db-migrate db-rollback db-status db-new db-seed db-reset db-psql

help: ## List available commands
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

db-up: ## Start local Postgres (data persists between runs)
	$(COMPOSE) up -d --wait db

db-down: ## Stop local Postgres (data is kept)
	$(COMPOSE) stop db

db-migrate: db-up ## Apply pending migrations and refresh db/schema.sql
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
