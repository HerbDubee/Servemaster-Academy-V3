/**
 * Request validation middleware backed by Zod schemas.
 *
 * Usage:
 *   const { validate } = require('../middleware/validate');
 *   const { loginSchema } = require('../lib/schemas');
 *   router.post('/api/auth/login', authLimiter, validate(loginSchema), handler);
 *
 * On success it replaces req[source] with the parsed (and coerced/trimmed)
 * data so downstream handlers get clean values. On failure it responds 400
 * with a human-readable message plus a structured `issues` array for clients
 * that want field-level detail.
 *
 * `source` selects which part of the request to validate ('body' | 'query'
 * | 'params'); defaults to 'body'.
 */

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({
        field: i.path.join('.') || source,
        message: i.message,
      }));
      const first = issues[0];
      return res.status(400).json({
        error: first ? `${first.field}: ${first.message}` : 'Invalid input',
        issues,
      });
    }
    req[source] = result.data;
    next();
  };
}

module.exports = { validate };
