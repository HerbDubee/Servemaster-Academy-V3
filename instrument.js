/**
 * Sentry initialization — MUST be required as the very first line of server.js,
 * before express/http and any other module, so Sentry's auto-instrumentation can
 * attach request context to captured errors.
 *
 * Safe-by-default: if SENTRY_DSN is not set, Sentry stays completely off and the
 * app runs normally. captureException(...) becomes a no-op in that state.
 *
 * Configured for ERROR MONITORING ONLY — performance tracing is disabled
 * (tracesSampleRate: 0) to stay well within Sentry's free tier.
 */

const Sentry = require('@sentry/node');

const dsn = process.env.SENTRY_DSN;
const sentryEnabled = Boolean(dsn);

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0, // errors only — no performance tracing
    sendDefaultPii: false, // we attach a minimal user id ourselves in the error handler
  });
}

/**
 * Process-level safety nets (unhandledRejection / uncaughtException) are handled
 * by Sentry's default integrations, which init() installs automatically:
 *   - unhandledRejection → captures + warns + keeps serving (mode 'warn')
 *   - uncaughtException   → captures + flushes + exits (Node's default crash behavior)
 * So we deliberately do NOT register our own process.on(...) handlers here —
 * doing so would double-capture every crash. When SENTRY_DSN is unset Sentry is
 * off and Node's own default behavior applies, exactly as before Sentry existed.
 */

module.exports = { Sentry, sentryEnabled };
