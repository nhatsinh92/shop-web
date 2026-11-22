# shop-web developer and agent entry points. Requires Node 22+ and pnpm (corepack).

SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help
PORT ?= 3000
E2E_STUB_PORT ?= 4010

.PHONY: help install test lint build demo e2e dev-mock test-scripts check-api

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
	node scripts/check-static-shell.mjs

demo: build ## Production build + next start on http://localhost:$(PORT) (/api/* -> gateway :8080)
	pnpm exec next start -p $(PORT)

# rewrites() in next.config.ts is resolved at build time, so the e2e build must see GATEWAY_URL.
e2e: node_modules ## Playwright smoke, auth journeys and axe against a build wired to a stub gateway
	GATEWAY_URL=http://localhost:$(E2E_STUB_PORT) pnpm build
	node scripts/check-static-shell.mjs
	E2E_STUB_PORT=$(E2E_STUB_PORT) pnpm e2e

dev-mock: node_modules ## Dev server with MSW answering /api/* (no backend needed)
	NEXT_PUBLIC_API_MOCKING=enabled pnpm exec next dev -p $(PORT)

check-api: node_modules ## Regenerate API types and fail when src/lib/api/generated differs from the commit
	pnpm gen:api
	git diff --exit-code -- src/lib/api/generated

test-scripts: ## Tests for the orchestration scripts (needs jq)
	bash scripts/tests/picker.test.sh
	bash scripts/tests/claim.test.sh
	bash scripts/tests/claim-shared-heartbeat.test.sh
	bash scripts/tests/heartbeat.test.sh
