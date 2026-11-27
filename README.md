# shop-web

Part of the "Mây" e-commerce project. See `CLAUDE.md` for how this repository is built and run.

## Cart journeys against the real gateway

`make e2e-gateway` runs the cart journeys in `e2e-gateway/` (desktop 1280 and phone 390, with axe)
through shop-api's real gateway, cart-service and core instead of the stub gateway of `make e2e`.

1. In shop-api: `make demo` (gateway on :8080, core on :8081, cart-service on :8082).
2. Here: `make e2e-gateway`. It checks that `http://localhost:8080/actuator/health` is `UP` (and
   stops within 10 s if not), builds with `GATEWAY_URL=http://localhost:8080` against the real
   core, starts `next start` on :3000 (the gateway's `WEB_ORIGIN`) and runs
   `playwright.gateway.config.ts`.

The journeys log in as the seed users of shop-api's `seed/README.md` and empty their carts first,
so the target can run again against the same demo. They run one at a time: the gateway allows five
logins per email per minute, and a login answered 429 waits for `Retry-After`. Slow, failing and
partial-backend scenarios stay in the stub suite (`make e2e`). Not part of PR CI.
