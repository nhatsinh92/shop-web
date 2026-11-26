# shop-web developer and agent entry points. Requires Node 22+ and pnpm (corepack).

SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help
PORT ?= 3000
K6_IMAGE ?= grafana/k6:1.8.3
E2E_STUB_PORT ?= 4010

.PHONY: help install test lint build demo e2e lighthouse load-journeys dev-mock test-scripts check-api

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

# next build prerenders cached product data: with CORE_INTERNAL_URL unset it runs against the
# fixture core (scripts/fixture-core.ts); set CORE_INTERNAL_URL to build against a real core.
build: node_modules ## Production build (fixture core unless CORE_INTERNAL_URL is set)
	bash scripts/with-fixture-core.sh pnpm build
	node scripts/check-static-shell.mjs

# The demo build shows the mock payment outcome control (NEXT_PUBLIC_* is inlined at build time).
demo: node_modules ## Production build + next start on http://localhost:$(PORT) (/api/* -> gateway :8080)
	NEXT_PUBLIC_MOCK_PAYMENT_CONTROLS=1 bash scripts/with-fixture-core.sh pnpm build
	node scripts/check-static-shell.mjs
	pnpm exec next start -p $(PORT)

# rewrites() in next.config.ts is resolved at build time, so the e2e build must see GATEWAY_URL.
e2e: node_modules ## Playwright smoke, auth journeys and axe against a build wired to a stub gateway
	NEXT_PUBLIC_MOCK_PAYMENT_CONTROLS=1 GATEWAY_URL=http://localhost:$(E2E_STUB_PORT) bash scripts/with-fixture-core.sh pnpm build
	node scripts/check-static-shell.mjs
	E2E_STUB_PORT=$(E2E_STUB_PORT) pnpm e2e

# Mobile preset, 3 runs, median per url; budgets live in lighthouserc.json. Not part of PR CI.
lighthouse: node_modules ## Lighthouse CI (mobile, median of 3) on Home, PDP and Cart against the stub gateway
	bash scripts/lighthouse.sh

# Needs shop-api's `make demo-peak` (gateway :8080, toxiproxy :8474, proxy cart-service-web :18083).
load-journeys: node_modules ## k6 journeys (30 VUs, 2 min) against `make demo-peak`, with a toxic phase
	NEXT_PUBLIC_MOCK_PAYMENT_CONTROLS=1 bash scripts/with-fixture-core.sh pnpm build
	node scripts/check-static-shell.mjs
	@pid=; \
	trap 'if [[ -n $$pid ]]; then pkill -P $$pid 2>/dev/null || true; kill $$pid 2>/dev/null || true; fi' EXIT; \
	CART_INTERNAL_URL=http://localhost:18083 pnpm exec next start -p $(PORT) & pid=$$!; \
	up=; for _ in $$(seq 1 200); do curl -fsS -o /dev/null http://localhost:$(PORT)/ 2>/dev/null && { up=1; break; }; sleep 0.3; done; \
	[[ -n $$up ]] || { echo "timed out waiting for shop-web on :$(PORT)" >&2; exit 1; }; \
	docker run --rm --network host -v "$$PWD/perf/k6:/scripts:ro" \
	  -e WEB_URL=$${WEB_URL:-http://localhost:$(PORT)} -e GATEWAY_URL -e TOXIPROXY_URL -e LOAD_PASSWORD \
	  $(K6_IMAGE) run /scripts/journeys.js

dev-mock: node_modules ## Dev server with MSW answering /api/* (no backend needed)
	NEXT_PUBLIC_MOCK_PAYMENT_CONTROLS=1 NEXT_PUBLIC_API_MOCKING=enabled pnpm exec next dev -p $(PORT)

check-api: node_modules ## Regenerate API types and fail when src/lib/api/generated differs from the commit
	pnpm gen:api
	git diff --exit-code -- src/lib/api/generated

test-scripts: ## Tests for the orchestration scripts (needs jq)
	bash scripts/tests/picker.test.sh
	bash scripts/tests/claim.test.sh
	bash scripts/tests/claim-shared-heartbeat.test.sh
	bash scripts/tests/heartbeat.test.sh
	node --test scripts/tests/fixture-core.test.ts
	bash scripts/tests/with-fixture-core.test.sh
	bash scripts/tests/lighthouse-report-issue.test.sh
