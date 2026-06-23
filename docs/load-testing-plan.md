# ServeMaster Academy — Load-Testing Plan

A practical plan for load-testing the Express app (single Node process, port 5000),
its PostgreSQL pool, and its third-party dependencies (Stripe, Resend, OpenAI,
ElevenLabs). The goal is to find the breaking point of each critical path, confirm
the app degrades gracefully under load, and right-size the DB pool and rate limits
**before** a marketing push or enterprise onboarding spikes traffic.

> **Golden rule: never load-test production.** Run against a dedicated staging
> deployment (or the dev Repl) with **test** Stripe keys, a throwaway database, and
> external calls stubbed. A real load run against prod would burn OpenAI/ElevenLabs
> credits, send real emails via Resend, create live Stripe sessions, and likely trip
> Replit infra limits.

---

## 1. System characteristics that shape the test

| Factor | Current value | Why it matters for load |
|---|---|---|
| App processes | 1 Node process | No clustering — a single event loop serves everything. CPU-bound work (PDF export, JSON-LD render) blocks all requests. |
| DB pool size | `pg` default = **10** connections (`db.js` has no `max`) | Concurrency above ~10 simultaneous DB queries queues on `pool.connect()`. This is the most likely first bottleneck. |
| Query pattern | `db.query()` acquires + releases a client per call | Fine, but long-running queries (manager reports, skill-gap aggregation) hold a pooled connection for their full duration. |
| Rate limiters | auth `10/15min`, contact `30/15min`, several `5/hr`, one `120/15min` | Load tests must either stay under these or use many distinct IPs/tokens, or they'll measure the limiter, not the app. |
| Heavy endpoints | AI chat stream, TTS, transcription, CSV/PDF export, manager dashboard aggregates | These dominate latency and external cost; test them in isolation. |
| Static/cacheable | 106×2 blog HTML pages, marketing pages, assets | High-volume but cheap; good for a raw throughput baseline. |

---

## 2. Endpoint tiers & target SLOs

Group endpoints by cost profile and assign a target. SLOs are starting points —
adjust once you have a baseline.

### Tier A — Static / read-mostly (cheap, high volume)
`GET /`, `/about`, `/features`, `/pricing`, `/blog`, `/blog/:slug`, `/api/chat-config`
- **Target:** p95 < 200 ms, error rate < 0.1% at 200 concurrent virtual users (VUs).
- These should scale near-linearly until CPU or bandwidth saturates.

### Tier B — Authenticated DB reads (moderate)
`/api/auth/me`, `/api/team`, `/api/manager/dashboard`, `/api/manager/staff/:id`,
`/api/user/training-plan`, progress/streak/badge reads
- **Target:** p95 < 500 ms, error rate < 1% at 50 concurrent VUs.
- Watch the DB pool here first — these are the queries that exhaust the 10 connections.

### Tier C — Write paths (validated, rate-limited)
`/api/auth/register`, `/api/auth/login`, `/api/contact`, `/api/newsletter/subscribe`,
`/api/payments/create-checkout`
- **Target:** p95 < 800 ms, correct 400s on bad input, correct 429s once the limiter trips.
- Verify the new Zod validation returns 400 (not 500) under load, and that bcrypt
  on register/login (CPU-bound) doesn't starve the event loop.

### Tier D — Expensive / external (low volume, isolate)
AI chat stream, TTS, Whisper transcription, CSV/PDF export, digest sends
- **Target:** define a *concurrency ceiling*, not a throughput target. Find how many
  simultaneous AI streams the box handles before p95 latency or memory blows up.
- **Always stub the external API** in load runs (see §5) — the point is to measure
  *our* handling (streaming backpressure, timeouts, memory), not OpenAI's latency.

---

## 3. Tooling

Recommended: **k6** (scriptable, good output, scenarios/stages, thresholds as
pass/fail gates). Alternatives: `autocannon` (quick single-endpoint throughput),
`artillery` (YAML scenarios). Examples below use k6.

Install: `k6` is a single Go binary — add via the package manager or run from a
separate machine pointed at the staging URL.

### Example: Tier A baseline (k6)
```js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },   // ramp up
    { duration: '3m', target: 200 },  // sustain
    { duration: '1m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.001'],
  },
};

const BASE = __ENV.BASE_URL; // e.g. https://staging-...

export default function () {
  const res = http.get(`${BASE}/`);
  check(res, { 'status 200': (r) => r.status === 200 });
}
```

### Example: Tier B authenticated (reuse a token, vary nothing destructive)
```js
const params = { headers: { Cookie: `token=${__ENV.JWT}` } };
http.get(`${BASE}/api/manager/dashboard`, params);
```
Pre-create a pool of seeded test users + JWTs so each VU uses its own token and you
don't all hammer one restaurant row. Keep VU count under the relevant rate limit, or
raise the limit in the staging config for the duration of the test.

---

## 4. Test scenarios (run in this order)

1. **Smoke (1–2 VUs, 1 min).** Confirm every target endpoint returns the expected
   status before scaling up. Catches config/env mistakes cheaply.
2. **Tier A throughput ramp.** 0→200 VUs over 5 min. Establishes the static-serving
   ceiling and the CPU baseline of the single Node process.
3. **Tier B DB-pool stress.** Ramp authenticated reads until p95 climbs sharply —
   that knee is your effective concurrency limit given the 10-connection pool.
   Re-run after raising the pool `max` to confirm the pool was the bottleneck.
4. **Tier C write + validation.** Mix valid and invalid payloads. Confirm 400s stay
   400s under load, 429s appear once limiters trip, and bcrypt-heavy register/login
   latency stays bounded.
5. **Tier D concurrency ceiling.** With external APIs stubbed, increase simultaneous
   AI streams / exports until latency or memory degrades. Record the safe ceiling.
6. **Soak (1–2 hr at moderate, e.g. 30 VUs).** Detect memory leaks, pool-connection
   leaks (a query path that never releases its client), and slow-growing latency.
7. **Spike.** Jump from idle to a large burst instantly to mimic a launch/email blast.
   Confirm recovery to baseline latency afterward.

---

## 5. Stubbing external dependencies (required for D, recommended elsewhere)

- **Stripe:** use test keys; for pure load, point checkout creation at a local mock
  or assert only that *our* request is well-formed. Never create thousands of live
  sessions.
- **Resend:** set a flag/env in staging that short-circuits `resend.emails.send` to a
  no-op + counter. Otherwise the soak test sends thousands of real emails.
- **OpenAI / ElevenLabs:** front them with a stub returning a canned stream of the
  same byte size. This isolates our streaming/backpressure/memory behavior and avoids
  burning credits.
- **DB:** use a separate staging database seeded with realistic volume (hundreds of
  users, multiple restaurants, full 30-module progress rows) so query plans match prod.

---

## 6. What to measure during each run

**Client-side (k6):** requests/sec, p50/p95/p99 latency, error rate, status-code
breakdown, data transferred.

**Server-side (watch live):**
- Event-loop lag (the single process is the shared resource).
- Process RSS / heap over time (leak detection during soak).
- **DB pool:** `pool.totalCount`, `pool.idleCount`, `pool.waitingCount` — if
  `waitingCount` is persistently > 0, requests are queuing on connections.
- Postgres: active connections, slow-query log, locks.
- The new structured request logs (`durationMs`, status) — aggregate by `path` to see
  which routes degrade first.

Add a lightweight `/healthz`-style debug endpoint (staging only) that returns pool
counts + `process.memoryUsage()` so the load tool can sample server state, or scrape
it with a sidecar script.

---

## 7. Likely bottlenecks & tuning levers (hypotheses to confirm)

1. **DB pool (10) is too small.** First thing to hit under Tier B/C. Lever: set
   `max` in `db.js` (e.g. 20–30) sized to the Postgres `max_connections` budget, and
   add `idleTimeoutMillis` / `connectionTimeoutMillis` so a saturated pool fails fast
   instead of hanging. Re-test to confirm the knee moves.
2. **Single Node process / CPU-bound work.** bcrypt, PDF/CSV generation, and JSON-LD
   rendering block the loop. Levers: move heavy export work off the request path
   (queue/worker), or run multiple instances behind the platform load balancer.
3. **AI streaming memory.** Many concurrent streams can balloon memory. Lever: cap
   concurrent AI requests (a semaphore) and enforce per-request timeouts.
4. **Rate limiter memory.** The default in-memory store grows with distinct IPs under
   a spike; confirm it's bounded, or move to a shared store if multi-instance.

---

## 8. Pass/fail gates (CI-able)

Encode SLOs as k6 `thresholds` so a run exits non-zero on regression. A minimal gate
to wire into a pre-release check: Tier A p95 < 200 ms & errors < 0.1%; Tier B p95 <
500 ms & errors < 1%; no pool `waitingCount` sustained > 0 at target load; flat memory
across the soak. Capture each run's summary (date, commit, results) so trends are
visible release over release.

---

## 9. Out of scope / cautions

- Do not load-test OAuth against Google's real endpoints (you'll get throttled/blocked).
- Do not run destructive writes (certificate issuance, payouts, real checkouts) at volume.
- Keep load origin IPs allow-listed if any WAF/proxy fronts staging, or you'll measure
  the proxy's throttling instead of the app.
