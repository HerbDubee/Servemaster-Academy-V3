/**
 * Structured request logging middleware.
 *
 * Mount EARLY in server.js — before route handlers, after `app.set('trust proxy', 1)`
 * so req.ip is correct behind Replit's proxy:
 *   app.use(requestLogger);
 *
 * For every request it:
 *   1. Assigns a request id (from the X-Request-Id header if a proxy set one,
 *      otherwise a fresh UUID) and echoes it back on the response so a client
 *      error can be correlated to a server log line.
 *   2. Logs one structured line when the response finishes, including method,
 *      path, status, duration in ms, client ip, and the authenticated user id
 *      (populated by the time the response finishes).
 *
 * High-noise static assets are skipped to keep the logs signal-dense.
 */

const crypto = require('crypto');
const { logger } = require('../lib/logger');

// Skip logging for static assets and high-frequency, low-value paths.
const SKIP_EXT = /\.(?:js|css|map|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|mp3|mp4|webm|wav)$/i;
const SKIP_PREFIX = ['/public', '/audio', '/__mockup', '/favicon'];

function shouldSkip(req) {
  if (SKIP_EXT.test(req.path)) return true;
  return SKIP_PREFIX.some((p) => req.path.startsWith(p));
}

function requestLogger(req, res, next) {
  // Correlation id — reuse an upstream one if present, else generate.
  const headerId = req.headers['x-request-id'];
  req.id = (typeof headerId === 'string' && headerId.length <= 100) ? headerId : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);

  if (shouldSkip(req)) return next();

  const start = process.hrtime.bigint();
  let logged = false;

  // `finish` = response sent cleanly. `close` = connection closed; if it fires
  // before `finish`, the client aborted (disconnect/timeout) and the response
  // never completed. Log exactly once for whichever happens first.
  function done(aborted) {
    if (logged) return;
    logged = true;

    const durationMs = Math.round(Number(process.hrtime.bigint() - start) / 1e5) / 10;
    const level = aborted || res.statusCode >= 500 ? 'error'
      : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]('request', {
      reqId: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs,
      ip: req.ip,
      userId: req.user && req.user.id,
      aborted: aborted || undefined,
    });
  }

  res.on('finish', () => done(false));
  res.on('close', () => done(!res.writableFinished));

  next();
}

module.exports = { requestLogger };
