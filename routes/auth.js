/**
 * Authentication routes.
 * Handles Google OAuth login and logout.
 * Uses db.query() to stay consistent with the existing codebase.
 */

const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const { signToken, COOKIE_OPTS } = require('../lib/auth');
const db = require('../db');

const router = express.Router();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Google OAuth Login
// Flow: Check if user exists → Create or update name → Sign JWT → Set cookie
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Missing credential' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
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
    console.error('Google auth error:', err.message);
    res.status(400).json({ error: 'Google authentication failed' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', COOKIE_OPTS);
  res.json({ success: true });
});

module.exports = router;
