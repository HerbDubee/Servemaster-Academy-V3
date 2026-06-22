/**
 * Global error-handling middleware.
 *
 * Mount AFTER all routes in server.js:
 *   app.use(errorHandler);
 *
 * Two ways errors reach here:
 *   1. next(err) — a route calls next(err) instead of res.status(500).json(...)
 *   2. Thrown inside an async route that has been wrapped with asyncHandler()
 *
 * Migration path for existing catch blocks:
 *   Before: } catch (err) { res.status(500).json({ error: 'Server error' }); }
 *   After:  } catch (err) { next(err); }
 *
 * NOTE: cookieParser and express.json() must be mounted in server.js BEFORE routes.
 * This handler sits at the end of the chain and does not depend on them.
 */

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Classify known error types so we can return the right HTTP status
 * without leaking stack traces in production.
 */
function classifyError(err) {
  // JWT verification failures
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return { status: 401, message: 'Invalid or expired session. Please log in again.' };
  }

  // Postgres unique-constraint violations (code 23505)
  if (err.code === '23505') {
    return { status: 409, message: 'A record with that value already exists.' };
  }

  // Postgres foreign-key violations (code 23503)
  if (err.code === '23503') {
    return { status: 400, message: 'Referenced record does not exist.' };
  }

  // Explicit HTTP status set by a route (e.g. throw Object.assign(new Error(...), { status: 403 }))
  if (err.status && err.status >= 400 && err.status < 600) {
    return { status: err.status, message: err.message };
  }

  // Default: unhandled server error
  return { status: 500, message: IS_PROD ? 'An unexpected error occurred.' : err.message };
}

/**
 * Express error handler — must have exactly 4 arguments.
 */
function errorHandler(err, req, res, next) {
  const { status, message } = classifyError(err);

  // Always log the full error server-side with request context
  console.error(
    `[ERROR] ${req.method} ${req.path}` +
    (req.user ? ` user=${req.user.id}` : '') +
    ` → ${status} ${err.message}` +
    (err.stack && !IS_PROD ? `\n${err.stack}` : '')
  );

  // Don't send a second response if headers already went out
  if (res.headersSent) return next(err);

  res.status(status).json({ error: message });
}

/**
 * asyncHandler — wraps an async route so any thrown error is forwarded
 * to the error handler automatically, without a try/catch in every route.
 *
 * Usage:
 *   app.get('/api/foo', asyncHandler(async (req, res) => {
 *     const data = await db.query(...);
 *     res.json(data);
 *   }));
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, asyncHandler };
