# k6 load journeys

`journeys.js` drives 30 virtual users for 2 minutes through Home → flash-sale PDP → add to cart →
`/cart` against shop-web (`next start`), with the server-rendered cart hole going through
toxiproxy. Run it with `make load-journeys`.

## Prerequisites

- Docker (the `grafana/k6` image, version pinned in the Makefile as `K6_IMAGE`).
- shop-api's `make demo-peak` running: gateway on :8080, toxiproxy API on :8474, the second proxy
  `cart-service-web` on :18083, and the load users `load-0001@example.com` … (seeded by
  `SEED_LOAD_USERS=1`, which `make demo-peak` sets).
- Nothing else on port 3000. The target builds shop-web, starts it with
  `CART_INTERNAL_URL=http://localhost:18083` (so the server-rendered cart read goes through
  `cart-service-web`), waits for it, runs k6 and stops it afterwards.

## Environment variables

| Variable        | Default                 | Meaning                                        |
| --------------- | ----------------------- | ---------------------------------------------- |
| `WEB_URL`       | `http://localhost:3000` | shop-web; `/api/*` is rewritten to the gateway |
| `GATEWAY_URL`   | `http://localhost:8080` | gateway, used by setup (login, flash sale)     |
| `TOXIPROXY_URL` | `http://localhost:8474` | toxiproxy API                                  |
| `LOAD_PASSWORD` | `load-test-2026`        | shared demo password of the load users         |

## What it does

- Setup logs in `load-0001` … `load-0030` once each (the gateway allows 5 logins per email per
  minute) and reads the first flash-sale product. Each VU reuses one session.
- Each iteration: `GET /`, `GET /product/<flash-sale slug>`, `POST /api/cart/items`,
  `GET /api/cart/summary`, `GET /cart`, then `DELETE /api/cart/items/<sku>` so carts do not grow.
- A second scenario adds a 1 000 ms latency toxic named `journeys-latency` to the proxies
  `cart-service` and `cart-service-web` from 40 s to 80 s and removes it afterwards. `teardown`
  removes it too, also after an abort.

## Thresholds

| Metric                               | Limit                                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `http_req_waiting{page:home}` (TTFB) | p95 < 200 ms                                                                                              |
| `http_req_waiting{page:pdp}` (TTFB)  | p95 < 200 ms                                                                                              |
| `http_req_waiting{page:cart}` (TTFB) | p95 < 400 ms                                                                                              |
| `http_req_failed{expect503:no}`      | rate < 1 % (cart reads through `/api/*` during the toxic phase are tagged `expect503:yes` and may be 503) |
| `cart_page_ok`                       | rate == 1: `/cart` answers 200 in every phase                                                             |

## Reading the summary

k6 prints a check mark or a cross per threshold; a cross makes the run exit non-zero. Look at the
`http_req_waiting` lines with their `page` tag first, then `cart_page_ok` and the failed checks
(`added to cart`, `/cart is 200`, `line removed`, the toxic add and remove checks). Requests carry
the tag `phase:toxic` or `phase:normal` (the toxic window plus 1 s before and 10 s after it) to
compare the phases. A toxic that was not removed shows up as a failed `latency toxic removed` check.
