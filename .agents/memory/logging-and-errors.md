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
