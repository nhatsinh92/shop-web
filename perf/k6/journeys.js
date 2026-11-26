// Load journeys for `make load-journeys`: 30 virtual users for 2 minutes walk Home -> flash-sale PDP
// -> add to cart -> /cart against shop-web (`next start`) and shop-api's `make demo-peak`.
// The server-rendered cart hole reads cart-service through toxiproxy (CART_INTERNAL_URL).
// A 1 000 ms latency toxic is on both cart-service proxies from 40 s to 80 s.
// Exits non-zero when a threshold fails. See perf/k6/README.md.
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";
import exec from "k6/execution";

const WEB_URL = __ENV.WEB_URL || "http://localhost:3000";
const GATEWAY_URL = __ENV.GATEWAY_URL || "http://localhost:8080";
const TOXIPROXY_URL = __ENV.TOXIPROXY_URL || "http://localhost:8474";
const PASSWORD = __ENV.LOAD_PASSWORD || "load-test-2026";

const VUS = 30;
const TOTAL_S = 120;
const TOXIC_START_S = 40;
const TOXIC_END_S = 80;
// The gateway breaker stays open for 10 s after the toxic is gone, and a request that starts just
// before the toxic is added is slowed by it: the window is widened on both sides.
const TOXIC_LEAD_S = 1;
const TOXIC_GRACE_S = 10;
const LOGIN_BATCH = 6; // BCrypt in core; the gateway allows 5 logins per email per minute
const PROXIES = ["cart-service", "cart-service-web"];
const TOXIC_NAME = "journeys-latency";

const cartPageOk = new Rate("cart_page_ok");

export const options = {
  setupTimeout: "2m",
  scenarios: {
    journeys: { executor: "constant-vus", vus: VUS, duration: `${TOTAL_S}s`, exec: "journey" },
    chaos: {
      executor: "per-vu-iterations",
      vus: 1,
      iterations: 1,
      maxDuration: `${TOTAL_S}s`,
      exec: "chaos",
    },
  },
  thresholds: {
    "http_req_waiting{page:home}": ["p(95)<200"],
    "http_req_waiting{page:pdp}": ["p(95)<200"],
    "http_req_waiting{page:cart}": ["p(95)<400"],
    // Every journey request except cart reads through /api/* during the toxic phase (expect503:yes).
    "http_req_failed{expect503:no}": ["rate<0.01"],
    // The /cart page is 200 in every phase: the cart hole falls back instead of failing.
    cart_page_ok: ["rate==1"],
  },
};

// Only 2xx counts as success; toxic-phase cart reads declare 503 as well (see cartRead).
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }));

const jar = new http.CookieJar(); // per VU: the session is sent explicitly, never mixed
let runStartMs = 0;

function init(data) {
  runStartMs = data.startMs;
}

function inToxicPhase() {
  const t = (Date.now() - runStartMs) / 1000;
  return t >= TOXIC_START_S - TOXIC_LEAD_S && t < TOXIC_END_S + TOXIC_GRACE_S;
}

function cookie(res, name) {
  const found = res.cookies[name];
  return found && found.length > 0 ? found[0].value : "";
}

function toxicApi(method, path, body) {
  return http.request(method, `${TOXIPROXY_URL}${path}`, body ? JSON.stringify(body) : null, {
    headers: { "Content-Type": "application/json" },
    tags: { kind: "toxiproxy" },
    responseCallback: http.expectedStatuses({ min: 200, max: 299 }, 404),
  });
}

// A failed DELETE would leave the toxic on, so it is retried; 404 means it is already gone.
function removeToxic(proxy) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = toxicApi("DELETE", `/proxies/${proxy}/toxics/${TOXIC_NAME}`);
    if ((res.status >= 200 && res.status < 300) || res.status === 404) return true;
    sleep(0.2);
  }
  return false;
}

function removeToxics() {
  for (const proxy of PROXIES) {
    const removed = removeToxic(proxy);
    check(null, { [`latency toxic removed from ${proxy}`]: () => removed });
  }
}

function addToxics() {
  for (const proxy of PROXIES) {
    toxicApi("DELETE", `/proxies/${proxy}/toxics/${TOXIC_NAME}`); // idempotent re-run
    const res = toxicApi("POST", `/proxies/${proxy}/toxics`, {
      name: TOXIC_NAME,
      type: "latency",
      stream: "downstream",
      toxicity: 1,
      attributes: { latency: 1000 },
    });
    check(res, { [`latency toxic added to ${proxy}`]: (r) => r.status === 200 });
  }
}

export function setup() {
  removeToxics();
  const headers = { "Content-Type": "application/json", Origin: WEB_URL };
  const sessions = [];
  for (let i = 1; i <= VUS; i += LOGIN_BATCH) {
    const emails = [];
    for (let j = i; j < i + LOGIN_BATCH && j <= VUS; j++)
      emails.push(`load-${String(j).padStart(4, "0")}@example.com`);
    const responses = http.batch(
      emails.map((email) => ({
        method: "POST",
        url: `${GATEWAY_URL}/api/auth/login`,
        body: JSON.stringify({ email, password: PASSWORD }),
        params: { headers, tags: { kind: "setup" } },
      })),
    );
    responses.forEach((res, k) => {
      if (res.status !== 200) {
        throw new Error(
          `login failed for ${emails[k]}: HTTP ${res.status} (is the load seed loaded?)`,
        );
      }
      sessions.push(`access_token=${cookie(res, "access_token")}; logged_in=1`);
    });
  }
  const sale = http.get(`${GATEWAY_URL}/api/flash-sales/current`, { tags: { kind: "setup" } });
  const item = sale.status === 200 ? sale.json("items.0") : null;
  if (!item)
    throw new Error(`no flash-sale product from GET /api/flash-sales/current: HTTP ${sale.status}`);
  runStartMs = Date.now();
  return { sessions, slug: item.slug, sku: item.sku, startMs: runStartMs };
}

// Runs also after an abort, so a failed run never leaves the toxic on cart-service.
export function teardown() {
  removeToxics();
}

// The toxic phase of this script: 40 s to 80 s, independent of shop-api's peak.js.
export function chaos(data) {
  init(data);
  sleep(TOXIC_START_S);
  addToxics();
  sleep(TOXIC_END_S - TOXIC_START_S);
  removeToxics();
}

export function journey(data) {
  init(data);
  const session = data.sessions[exec.vu.idInTest % data.sessions.length];
  const read = { Cookie: session };
  const write = { Cookie: session, "Content-Type": "application/json", Origin: WEB_URL };
  const toxic = inToxicPhase();
  const tag = (page, expect503) => ({
    page,
    expect503: expect503 ? "yes" : "no",
    phase: toxic ? "toxic" : "normal",
  });

  http.get(`${WEB_URL}/`, { jar, headers: read, tags: tag("home") });
  sleep(0.3);
  http.get(`${WEB_URL}/product/${data.slug}`, { jar, headers: read, tags: tag("pdp") });
  sleep(0.3);

  const added = http.post(
    `${WEB_URL}/api/cart/items`,
    JSON.stringify({ sku: data.sku, quantity: 1 }),
    {
      jar,
      headers: write,
      tags: tag("cart-add"),
    },
  );
  check(added, { "added to cart": (r) => r.status >= 200 && r.status < 300 });

  // The header badge read: during the toxic phase the gateway answers 503 SERVICE_UNAVAILABLE.
  http.get(`${WEB_URL}/api/cart/summary`, {
    jar,
    headers: read,
    tags: tag("cart-summary", true),
    responseCallback: http.expectedStatuses({ min: 200, max: 299 }, 503),
  });

  const page = http.get(`${WEB_URL}/cart`, { jar, headers: read, tags: tag("cart") });
  cartPageOk.add(page.status === 200);
  check(page, { "/cart is 200": (r) => r.status === 200 });

  if (added.status >= 200 && added.status < 300) {
    const removed = http.del(`${WEB_URL}/api/cart/items/${data.sku}`, null, {
      jar,
      headers: write,
      tags: tag("cart-remove"),
    });
    check(removed, { "line removed": (r) => r.status >= 200 && r.status < 300 });
  }
  sleep(0.5);
}
