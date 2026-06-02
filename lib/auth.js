/**
 * Authentication helpers.
 * Responsible for JWT token signing/verification, cookie configuration,
 * and reusable authentication middleware.
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET env var is not set.');
}

const COOKIE_OPTS = {
  httpOnly: true,
  maxAge: 30 * 24 * 3600 * 1000,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production'
};

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
}

module.exports = {
  signToken,
  verifyToken,
  requireAuth,
  COOKIE_OPTS,
  JWT_SECRET
};
