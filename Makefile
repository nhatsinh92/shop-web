# shop-web developer and agent entry points. Requires Node 22+ and pnpm (corepack).

SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help
PORT ?= 3000

.PHONY: help install test lint build demo e2e dev-mock test-scripts

help: ## Show targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

node_modules: package.json pnpm-lock.yaml
	pnpm install --frozen-lockfile
	@touch node_modules

install: node_modules ## Install dependencies from the lockfile

test: node_modules ## Unit and component tests (Vitest + Testing Library + MSW)
	pnpm test

lint: node_modules ## ESLint (feature boundaries, TanStack Query, no raw hex), tsc, Prettier
	pnpm lint

build: node_modules ## Production build
	pnpm build

demo: build ## Production build + next start on http://localhost:$(PORT) (/api/* -> gateway :8080)
	pnpm exec next start -p $(PORT)

e2e: build ## Playwright smoke + axe against the production build
	pnpm e2e

dev-mock: node_modules ## Dev server with MSW answering /api/* (no backend needed)
	NEXT_PUBLIC_API_MOCKING=enabled pnpm exec next dev -p $(PORT)

test-scripts: ## Tests for the orchestration scripts (needs jq)
	bash scripts/tests/picker.test.sh
