---
name: Logging & centralized error handling
description: How structured logging and the global error handler fit together, and what is intentionally not yet migrated.
---

# Structured logging + centralized error handling

- `lib/logger.js` is a dependency-free structured logger: JSON-per-line when `NODE_ENV==='production'`, pretty/colored line in dev, level-gated by `LOG_LEVEL` (default `info`). Use `logger.info/warn/error/debug(msg, fields)` — do not add console.log for app events.
- `middleware/requestLogger.js` logs one line per request (mounted early in `server.js`, after `trust proxy`+compression, before cookieParser/routes). Adds `X-Request-Id` (`req.id`) for correlation, skips static assets, and logs once on whichever of `finish`/`close` fires first (`aborted:true` when the client disconnects before the response completes).
- `middleware/errorHandler.js` is the global handler (mounted last). It classifies known errors (JWT→401, PG 23505→409, 23503→400, explicit `err.status`) and logs via the structured logger as `request_error`.

**Deferred (important):** Routes still respond with their own `res.status(500).json(...)` and do NOT call `next(err)`/`asyncHandler`. So the central error handler today only catches *unhandled* throws and explicit `next(err)` paths. Migrating routes to `asyncHandler`/`next(err)` is a known, intentional follow-up — until then, error classification/telemetry is partial.

**Why:** Logging was the missing half of the reliability work — the error handler already existed but was effectively unused. Doing the ~130-call route migration in the same pass was deemed too risky to bundle with the logging rollout.

## Sentry error monitoring

- `instrument.js` (repo root) inits Sentry and **must be the first `require` in `server.js`, before express/http**, or auto-instrumentation can't attach request context. It no-ops entirely when `SENTRY_DSN` is unset, so the app never depends on Sentry being configured.
- Configured for **errors only** (`tracesSampleRate: 0`) deliberately, to stay within Sentry's free tier — do not enable tracing without checking quota.
- Process-level crash handling (`unhandledRejection` / `uncaughtException`) is left to **Sentry's default integrations** — do NOT add custom `process.on(...)` handlers in `instrument.js`, they double-capture every crash. The defaults already do exactly what's wanted: unhandledRejection → capture + warn + keep serving (mode `'warn'`); uncaughtException → capture + flush + exit (Node's default crash behavior). **Why:** an initial pass hand-rolled these handlers; code review caught the double-capture since `Sentry.init()` installs them by default.
- `errorHandler.js` sends only 5xx to Sentry (4xx are expected, not bugs). Because routes mostly use inline `res.status(500)` instead of `next(err)`, those inline failures do NOT reach Sentry yet — same blocker as the deferred migration above. Alert rules live in the Sentry dashboard, not the code.
