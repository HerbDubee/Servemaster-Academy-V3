---
name: Logging & centralized error handling
description: How structured logging and the global error handler fit together, and what is intentionally not yet migrated.
---

# Structured logging + centralized error handling

- `lib/logger.js` is a dependency-free structured logger: JSON-per-line when `NODE_ENV==='production'`, pretty/colored line in dev, level-gated by `LOG_LEVEL` (default `info`). Use `logger.info/warn/error/debug(msg, fields)` — do not add console.log for app events.
- `middleware/requestLogger.js` logs one line per request (mounted early in `server.js`, after `trust proxy`+compression, before cookieParser/routes). Adds `X-Request-Id` (`req.id`) for correlation, skips static assets, and logs once on whichever of `finish`/`close` fires first (`aborted:true` when the client disconnects before the response completes).
- `middleware/errorHandler.js` is the global handler (mounted last). It classifies known errors (JWT→401, PG 23505→409, 23503→400, explicit `err.status`) and logs via the structured logger as `request_error`.

**Rule:** Route catch blocks should `next(err)` (not inline `res.status(500).json(...)`) so genuine server 500s flow through the central handler and Sentry. To keep an endpoint-specific client message without losing the real error/stack, attach it: `next(Object.assign(err, { publicMessage: 'Failed to fetch tenants' }))` — `classifyError` returns `{ error: publicMessage }` at 500 while logging/Sentry still see the original `err`. Without `publicMessage`, a 500 is generic in prod (`err.message` in dev) to avoid leaking internals. Inline `res.status(500)` is only correct for non-error cases — config guards, graceful degraded responses, non-JSON `.send()` bodies, or custom-shape fallbacks. Any handler that calls `next(...)` needs `next` in its signature.

**Why publicMessage:** A bare `next(err)` genericizes the prod client message, which is a behavior drift from the curated per-endpoint 500 messages the frontend relied on. `publicMessage` reconciles "real error to Sentry" with "stable client message" — don't drop it when migrating a 500.

**Why:** The error handler existed but was bypassed by inline 500s, so 5xx telemetry/Sentry was partial.

**How to apply / gotcha:** When bulk-converting `res.status(500)` → `next(<var>)`, the forwarded variable MUST be the *enclosing* catch's binding. A nested inner `catch (e) {...}` that closes before an outer `catch (err) {...}` will fool a naive nearest-`catch`-upward scan into forwarding `e` (undefined) from the outer block — a `ReferenceError` that masks the real error. After any such migration, verify each `next(v)` against its enclosing catch var (brace-aware), don't just trust `node --check`.

## Sentry error monitoring

- `instrument.js` (repo root) inits Sentry and **must be the first `require` in `server.js`, before express/http**, or auto-instrumentation can't attach request context. It no-ops entirely when `SENTRY_DSN` is unset, so the app never depends on Sentry being configured.
- Configured for **errors only** (`tracesSampleRate: 0`) deliberately, to stay within Sentry's free tier — do not enable tracing without checking quota.
- Process-level crash handling (`unhandledRejection` / `uncaughtException`) is left to **Sentry's default integrations** — do NOT add custom `process.on(...)` handlers in `instrument.js`, they double-capture every crash. The defaults already do exactly what's wanted: unhandledRejection → capture + warn + keep serving (mode `'warn'`); uncaughtException → capture + flush + exit (Node's default crash behavior). **Why:** an initial pass hand-rolled these handlers; code review caught the double-capture since `Sentry.init()` installs them by default.
- `errorHandler.js` sends only 5xx to Sentry (4xx are expected, not bugs). Route catch blocks now `next(err)`, so server 500s reach Sentry; only the intentional inline `res.status(500)` survivors (listed above) stay outside that path on purpose. Alert rules live in the Sentry dashboard, not the code.
