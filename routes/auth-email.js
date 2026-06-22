'use strict';
const express = require('express');

module.exports = function createAuthEmailRouter({
  db, resend, bcrypt, jwt, JWT_SECRET, COOKIE_OPTS,
  ADMIN_EMAIL, APP_URL, FROM_EMAIL,
  authLimiter, authMiddleware,
  escapeHtml, getTenantBrandingForEmail,
  sendTrialDripEmails, sendDripEmailIfDue, updateStreak,
  getOrCreateUnsubToken, emailFooter,
  highestPlan,
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
}) {
  const router = express.Router();

  // ── Register ─────────────────────────────────────────────────────────────────
  router.post('/api/auth/register', authLimiter, async (req, res) => {
    const { email, password, name, level } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Missing required fields' });
    try {
      const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
      if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });
      const hash = await bcrypt.hash(password, 10);
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);
      const result = await db.query(
        'INSERT INTO users (email, password_hash, name, experience_level, trial_ends_at, is_trial_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, role, trial_ends_at, is_trial_active',
        [email.toLowerCase(), hash, name, level || 'New to serving', trialEndsAt, true]
      );
      const user = result.rows[0];
      await db.query('INSERT INTO streaks (user_id) VALUES ($1)', [user.id]);
      try {
        await db.query(
          'UPDATE referrals SET referred_user_id = $1 WHERE referred_email = $2 AND status = $3 AND referred_user_id IS NULL',
          [user.id, user.email, 'pending']
        );
      } catch (refLinkErr) { console.error('Referral link error:', refLinkErr.message); }
      const affRef = req.cookies && req.cookies.sma_ref;
      if (affRef) {
        try { await db.query(`UPDATE users SET influencer_ref_code = $1 WHERE id = $2 AND influencer_ref_code IS NULL`, [affRef, user.id]); } catch (e) {}
      }
      const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
      res.cookie('token', token, COOKIE_OPTS);
      res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, token, message: 'Account created – 14-day trial started!' });
      (async () => { try {
        const wb = await getTenantBrandingForEmail(user.id);
        const unsubToken = await getOrCreateUnsubToken(user.id);
        const unsubUrl = `${APP_URL}/unsubscribe?token=${unsubToken}`;
        resend.emails.send({
          from: wb.fromLine,
          to: user.email,
          subject: `Welcome to ${wb.brandName} – Your 14-day trial starts now`,
          html: `
            <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
              <img src="${wb.logoUrl}" alt="${escapeHtml(wb.brandName)}" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;">
              <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(user.name)},</p>
              <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">I'm Kirk Adamson, founder of ServeMaster Academy.</p>
              <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Thank you for starting your free trial. I created this platform because I believe every guest deserves to feel truly cared for — and every server deserves the tools to make that happen.</p>
              <p style="font-size:16px;line-height:1.7;margin-bottom:32px;">Your 14-day journey begins now. I recommend starting with Module 1: Foundations of Exceptional Service.</p>
              <p style="margin-bottom:32px;">
                <a href="${APP_URL}/app" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Start Module 1 Now</a>
              </p>
              <p style="font-size:16px;line-height:1.7;margin-bottom:24px;">I'd love to hear what you think after your first session.</p>
              <p style="font-size:15px;line-height:1.7;color:#a3a3a3;">Warm regards,<br>
              <strong style="color:#f5f5f5;">Kirk Adamson</strong><br>
              Founder, ServeMaster Academy<br>
              <a href="mailto:${FROM_EMAIL}" style="color:#d4af37;text-decoration:none;">${FROM_EMAIL}</a></p>
              ${wb.poweredBy}
              ${emailFooter(unsubUrl)}
            </div>
          `
        }).catch(err => console.error('Welcome email error:', err.message));
      } catch(e) {} })();
    } catch (err) {
      console.error('Register error:', err.message);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  // ── Login ────────────────────────────────────────────────────────────────────
  router.post('/api/auth/login', authLimiter, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });
    try {
      const result = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
      if (!result.rows.length) return res.status(401).json({ error: 'Invalid email or password' });
      const user = result.rows[0];
      if (!user.password_hash) return res.status(401).json({ error: 'This account uses Google login' });
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid email or password' });
      await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
      await updateStreak(user.id);
      if (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && user.role !== 'admin') {
        await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]);
        user.role = 'admin';
      }
      const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
      res.cookie('token', token, COOKIE_OPTS);
      const daysLeft = user.trial_ends_at
        ? Math.max(0, Math.ceil((new Date(user.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)))
        : 0;
      res.json({
        user: { id: user.id, name: user.name, email: user.email, role: user.role, experience_level: user.experience_level, subscription_status: user.subscription_status || 'free' },
        token,
        trialDaysLeft: daysLeft,
        message: daysLeft > 0 ? `You have ${daysLeft} days left in your free trial` : 'Trial expired'
      });
      sendTrialDripEmails(user);
      sendDripEmailIfDue(user.id, user.email, user.name).catch(() => {});
    } catch (err) {
      console.error('Login error:', err.message);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // ── Logout ───────────────────────────────────────────────────────────────────
  router.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
  });

  // ── Forgot password ──────────────────────────────────────────────────────────
  router.post('/api/forgot-password', authLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    try {
      await db.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id serial PRIMARY KEY,
        user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token varchar(64) NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        used boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT NOW()
      )`);
      const userRes = await db.query('SELECT id, name, email FROM users WHERE email = $1 AND password_hash IS NOT NULL', [email.toLowerCase()]);
      if (userRes.rows.length) {
        const user = userRes.rows[0];
        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 60 * 60 * 1000);
        await db.query('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', [user.id, token, expires]);
        const resetLink = `${APP_URL}/reset-password?token=${token}`;
        await resend.emails.send({
          from: `Kirk Adamson <${FROM_EMAIL}>`,
          to: user.email,
          subject: 'Reset your ServeMaster Academy password',
          html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
            <img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;">
            <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${user.name},</p>
            <p style="font-size:16px;line-height:1.7;margin-bottom:24px;">We received a request to reset your ServeMaster Academy password. Click the button below to choose a new one. This link expires in 1 hour.</p>
            <p style="margin-bottom:32px;"><a href="${resetLink}" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Reset My Password</a></p>
            <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin-bottom:16px;">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
            <p style="font-size:15px;line-height:1.7;color:#a3a3a3;">Warm regards,<br><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy</p>
            <hr style="border:none;border-top:1px solid #333;margin:32px 0;">
            <p style="font-size:12px;color:#666;">ServeMaster Academy · <a href="https://servemasteracademy.ca" style="color:#666;">servemasteracademy.ca</a></p>
          </div>`
        });
      }
      res.json({ success: true });
    } catch (err) {
      console.error('Forgot password error:', err.message);
      res.json({ success: true });
    }
  });

  // ── Reset password ───────────────────────────────────────────────────────────
  router.post('/api/reset-password', authLimiter, async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    try {
      const tokenRes = await db.query(
        'SELECT * FROM password_reset_tokens WHERE token = $1 AND used = false AND expires_at > NOW()',
        [token]
      );
      if (!tokenRes.rows.length) {
        return res.status(400).json({ error: 'This reset link is invalid or has expired.', expired: true });
      }
      const resetToken = tokenRes.rows[0];
      const hash = await bcrypt.hash(newPassword, 10);
      await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, resetToken.user_id]);
      await db.query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [resetToken.id]);
      res.json({ success: true });
    } catch (err) {
      console.error('Reset password error:', err.message);
      res.status(500).json({ error: 'Password reset failed. Please try again.' });
    }
  });

  // ── Auth/me ──────────────────────────────────────────────────────────────────
  router.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
      const result = await db.query('SELECT id, name, email, role, experience_level, restaurant_id, subscription_status, trial_ends_at FROM users WHERE id = $1', [req.user.id]);
      if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
      const user = result.rows[0];
      if (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && user.role !== 'admin') {
        await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]);
        user.role = 'admin';
      }
      let restaurantPlan = 'free';
      if (user.restaurant_id) {
        const rRes = await db.query('SELECT plan FROM restaurants WHERE id = $1', [user.restaurant_id]);
        restaurantPlan = rRes.rows[0]?.plan || 'free';
      }
      user.effective_plan = user.role === 'admin' ? 'premium' : highestPlan(user.subscription_status, restaurantPlan);
      if (user.role === 'admin') user.subscription_status = 'premium';
      const daysLeft = user.trial_ends_at
        ? Math.max(0, Math.ceil((new Date(user.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)))
        : 0;
      res.json({
        user,
        trialDaysLeft: daysLeft,
        message: daysLeft > 0 ? `You have ${daysLeft} days left in your free trial` : 'Trial expired'
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  // ── Google OAuth ─────────────────────────────────────────────────────────────
  router.get('/api/auth/google', authLimiter, (req, res) => {
    if (!GOOGLE_CLIENT_ID) return res.redirect('/login?error=google_not_configured');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const BASE_URL = process.env.APP_URL || `https://${req.get('host')}`;
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: `${BASE_URL}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account'
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  router.get('/api/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/login?error=google_auth_failed');
    try {
      const BASE_URL = process.env.APP_URL || `https://${req.get('host')}`;
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: `${BASE_URL}/api/auth/google/callback`,
          grant_type: 'authorization_code'
        })
      });
      const tokens = await tokenRes.json();
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      const profile = await profileRes.json();
      let userResult = await db.query('SELECT * FROM users WHERE google_id = $1', [profile.sub]);
      let user; let isNewUser = false;
      if (!userResult.rows.length) {
        const existing = await db.query('SELECT * FROM users WHERE email = $1', [profile.email]);
        if (existing.rows.length) {
          await db.query('UPDATE users SET google_id = $1 WHERE id = $2', [profile.sub, existing.rows[0].id]);
          user = existing.rows[0];
        } else {
          const trialEndsAt = new Date();
          trialEndsAt.setDate(trialEndsAt.getDate() + 14);
          const ins = await db.query(
            'INSERT INTO users (email, google_id, name, experience_level, trial_ends_at, is_trial_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [profile.email.toLowerCase(), profile.sub, profile.name, 'New to serving', trialEndsAt, true]
          );
          user = ins.rows[0];
          isNewUser = true;
          await db.query('INSERT INTO streaks (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
          try {
            await db.query(
              'UPDATE referrals SET referred_user_id = $1 WHERE referred_email = $2 AND status = $3 AND referred_user_id IS NULL',
              [user.id, user.email.toLowerCase(), 'pending']
            );
          } catch (refLinkErr) { console.error('Referral link (Google) error:', refLinkErr.message); }
          const affRefG = req.cookies && req.cookies.sma_ref;
          if (affRefG) {
            try { await db.query(`UPDATE users SET influencer_ref_code = $1 WHERE id = $2 AND influencer_ref_code IS NULL`, [affRefG, user.id]); } catch (e) {}
          }
        }
      } else { user = userResult.rows[0]; }
      await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
      await updateStreak(user.id);
      if (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && user.role !== 'admin') {
        await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]);
        user.role = 'admin';
      }
      const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
      const signupFlag = isNewUser ? '&signup=1' : '';
      res.redirect('/login?token=' + encodeURIComponent(token) + signupFlag);
      if (isNewUser) {
        (async () => { try {
          const wb = await getTenantBrandingForEmail(user.id);
          const unsubToken = await getOrCreateUnsubToken(user.id);
          const unsubUrl = `https://servemasteracademy.ca/unsubscribe?token=${unsubToken}`;
          resend.emails.send({
            from: wb.fromLine,
            to: user.email,
            subject: `Welcome to ${wb.brandName} – Your 14-day trial starts now`,
            html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="${wb.logoUrl}" alt="${escapeHtml(wb.brandName)}" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(user.name)},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">I'm Kirk Adamson, founder of ServeMaster Academy.</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Thank you for starting your free trial. I created this platform because I believe every guest deserves to feel truly cared for — and every server deserves the tools to make that happen.</p><p style="font-size:16px;line-height:1.7;margin-bottom:32px;">Your 14-day journey begins now. I recommend starting with Module 1: Foundations of Exceptional Service.</p><p style="margin-bottom:32px;"><a href="https://servemasteracademy.ca/app" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Start Module 1 Now</a></p><p style="font-size:16px;line-height:1.7;margin-bottom:24px;">I'd love to hear what you think after your first session.</p><p style="font-size:15px;line-height:1.7;color:#a3a3a3;">Warm regards,<br><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy<br><a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#d4af37;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a></p>${wb.poweredBy}${emailFooter(unsubUrl)}</div>`
          }).catch(err => console.error('Google welcome email error:', err.message));
        } catch(e) {} })();
      } else {
        sendTrialDripEmails(user);
      }
    } catch (err) {
      console.error('Google auth error:', err.message);
      res.redirect('/login?error=google_auth_failed');
    }
  });

  return router;
};
