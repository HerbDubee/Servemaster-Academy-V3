/**
 * Authentication routes.
 * Handles Google OAuth login and logout.
 * Uses db.query() to stay consistent with the existing codebase.
 *
 * NOTE: cookieParser middleware must remain in server.js (app-level).
 * This router relies on it being applied before these routes are hit.
 */

const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const { signToken, COOKIE_OPTS } = require('../lib/auth');
const db = require('../db');

const router = express.Router();
router.use(express.json()); // body parsing is self-contained — mount order in server.js doesn't matter

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Google OAuth Login
// Flow: Check if user exists → Create or update name → Sign JWT → Set cookie
router.post('/google', async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Missing credential' });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      // Invalid/expired Google credential is a client error, not a server bug.
      return res.status(400).json({ error: 'Google authentication failed' });
    }

    const email = payload.email.toLowerCase();
    const name = payload.name || '';

    // Check for existing user
    const existingUserResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);

    let user;
    if (existingUserResult.rows.length === 0) {
      // Create new user
      const insertResult = await db.query(
        `INSERT INTO users (email, name, created_at) 
         VALUES ($1, $2, NOW()) 
         RETURNING *`,
        [email, name]
      );
      user = insertResult.rows[0];
    } else {
      // Update name if it has changed in Google
      user = existingUserResult.rows[0];
      if (name && name !== user.name) {
        const updateResult = await db.query(
          `UPDATE users SET name = $1 WHERE email = $2 RETURNING *`,
          [name, email]
        );
        user = updateResult.rows[0];
      }
    }

    // Defensive check — should never happen given the logic above
    if (!user) {
      return next(Object.assign(new Error('Failed to create or retrieve user'), { publicMessage: 'Failed to create or retrieve user' }));
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      name: user.name || ''
    });

    res.cookie('token', token, COOKIE_OPTS);
    res.json({ 
      success: true, 
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name || '' 
      } 
    });

  } catch (err) {
    console.error('Google auth error:', err);
    next(Object.assign(err, { publicMessage: 'Google authentication failed' }));
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', COOKIE_OPTS);
  res.json({ success: true });
});

module.exports = router;
