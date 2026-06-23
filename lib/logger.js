/**
 * Lightweight structured logger (dependency-free).
 *
 * - In production (NODE_ENV === 'production') it emits one JSON object per line,
 *   which is what log aggregators (Datadog, Logtail, CloudWatch, Replit's own
 *   log viewer) parse cleanly.
 * - In development it emits a compact, human-readable line.
 *
 * Levels (most → least severe): error, warn, info, debug.
 * Set LOG_LEVEL to control verbosity (default: info). debug is suppressed
 * unless LOG_LEVEL=debug.
 *
 * Usage:
 *   const { logger } = require('./lib/logger');
 *   logger.info('server_start', { port: 5000 });
 *   logger.error('db_query_failed', { reqId, err: err.message });
 */

const IS_PROD = process.env.NODE_ENV === 'production';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LEVEL = LEVELS[(process.env.LOG_LEVEL || '').toLowerCase()] ?? LEVELS.info;

const COLORS = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', debug: '\x1b[90m', reset: '\x1b[0m' };

function prettyFormat(rec) {
  const { ts, level, msg, ...fields } = rec;
  const color = COLORS[level] || '';
  const time = ts.slice(11, 23); // HH:MM:SS.mmm
  const tail = Object.keys(fields).length
    ? ' ' + Object.entries(fields)
        .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join(' ')
    : '';
  return `${color}${time} ${level.toUpperCase().padEnd(5)}${COLORS.reset} ${msg}${tail}`;
}

function emit(level, msg, fields = {}) {
  if (LEVELS[level] > CURRENT_LEVEL) return;

  // Drop undefined fields so they don't clutter the output.
  const clean = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) clean[k] = v;
  }

  const rec = { ts: new Date().toISOString(), level, msg, ...clean };
  const line = IS_PROD ? JSON.stringify(rec) : prettyFormat(rec);

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

const logger = {
  error: (msg, fields) => emit('error', msg, fields),
  warn: (msg, fields) => emit('warn', msg, fields),
  info: (msg, fields) => emit('info', msg, fields),
  debug: (msg, fields) => emit('debug', msg, fields),
};

module.exports = { logger, LEVELS };
