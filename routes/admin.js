const express = require('express');
const createDigests = require('../lib/digests');
const createAdminAffiliatesRouter = require('./admin-affiliates');

const SCHOLARSHIP_MONTHLY_CAP = 15;
const SCHOLARSHIP_DAYS = 60;
const TOTAL_MODULES = 30;
const TOTAL_SCENARIOS = 36;

function isValidHex(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

const DEMO_USERS = [
  { name: 'Sophie Tremblay',   email: 'sophie.tremblay.sma@example.com',   modules: 30 },
  { name: 'Liam Chen',         email: 'liam.chen.sma@example.com',          modules: 30 },
  { name: 'Émilie Gagnon',     email: 'emilie.gagnon.sma@example.com',      modules: 30 },
  { name: 'Marcus Williams',   email: 'marcus.williams.sma@example.com',    modules: 29 },
  { name: 'Chloé Bouchard',    email: 'chloe.bouchard.sma@example.com',     modules: 28 },
  { name: 'Noah Patel',        email: 'noah.patel.sma@example.com',         modules: 27 },
  { name: 'Camille Roy',       email: 'camille.roy.sma@example.com',        modules: 26 },
  { name: 'Ethan MacLeod',     email: 'ethan.macleod.sma@example.com',      modules: 25 },
  { name: 'Amélie Côté',       email: 'amelie.cote.sma@example.com',        modules: 24 },
  { name: 'Jasmine Singh',     email: 'jasmine.singh.sma@example.com',      modules: 22 },
  { name: 'Gabriel Fortin',    email: 'gabriel.fortin.sma@example.com',     modules: 20 },
  { name: 'Olivia Thompson',   email: 'olivia.thompson.sma@example.com',    modules: 18 },
  { name: 'Félix Lavoie',      email: 'felix.lavoie.sma@example.com',       modules: 17 },
  { name: 'Ava Morrison',      email: 'ava.morrison.sma@example.com',       modules: 15 },
  { name: 'Raphaël Bergeron',  email: 'raphael.bergeron.sma@example.com',   modules: 14 },
  { name: 'Maya Okafor',       email: 'maya.okafor.sma@example.com',        modules: 12 },
  { name: 'Lucas Pelletier',   email: 'lucas.pelletier.sma@example.com',    modules: 11 },
  { name: 'Isabella Nguyen',   email: 'isabella.nguyen.sma@example.com',    modules: 10 },
  { name: 'Antoine Gauthier',  email: 'antoine.gauthier.sma@example.com',   modules: 9  },
  { name: 'Zara Ahmed',        email: 'zara.ahmed.sma@example.com',         modules: 8  },
  { name: 'Samuel Morin',      email: 'samuel.morin.sma@example.com',       modules: 7  },
  { name: 'Emma Dubois',       email: 'emma.dubois.sma@example.com',        modules: 6  },
  { name: 'Nathan Lefebvre',   email: 'nathan.lefebvre.sma@example.com',    modules: 5  },
  { name: 'Mia Campbell',      email: 'mia.campbell.sma@example.com',       modules: 4  },
  { name: 'Julien Bélanger',   email: 'julien.belanger.sma@example.com',    modules: 3  },
];

module.exports = function createAdminRouter({
  db, resend, escapeHtml, getUncachableStripeClient,
  sendWeeklyManagerDigests, APP_URL, ADMIN_EMAIL, jwt, JWT_SECRET,
}) {
  const router = express.Router();

  // ── Admin middleware ──────────────────────────────────────────────────────────
  async function adminMiddleware(req, res, next) {
    const token = req.cookies.token || (req.headers.authorization || '').replace('Bearer ', '') || req.query._t || '';
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
      if (!rows.length || rows[0].role !== 'admin') return res.status(403).json({ error: 'Admin access only' });
      next();
    } catch (e) {
      if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Invalid token' });
      }
      res.status(500).json({ error: 'Server error' });
    }
  }

  // ── Digest functions (lib/digests.js) ────────────────────────────────────────
  const { buildWeeklyAttribution, sendOpenClawWeeklyDigest, sendKirkTrialDigest } =
    createDigests({ db, resend, escapeHtml, APP_URL });

  // ── Affiliates router (routes/admin-affiliates.js) ────────────────────────────
  router.use(createAdminAffiliatesRouter({ db, resend, escapeHtml, getUncachableStripeClient, adminMiddleware, APP_URL }));

  // ── Scholarship helpers ───────────────────────────────────────────────────────
  async function getMonthlyApprovedCount() {
    const res = await db.query(
      `SELECT COUNT(*) as cnt FROM scholarship_applications
       WHERE status IN ('approved','completed')
       AND date_trunc('month', reviewed_at) = date_trunc('month', NOW())`
    );
    return parseInt(res.rows[0].cnt);
  }

  function genScholarshipCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `SCH-${part()}-${part()}`;
  }

  // ── Demo seed helper ──────────────────────────────────────────────────────────
  async function seedDemoUsers() {
    let inserted = 0, skipped = 0, errors = [];
    for (const u of DEMO_USERS) {
      try {
        const existing = await db.query('SELECT id FROM users WHERE email = $1', [u.email]);
        let userId;
        if (existing.rows.length > 0) {
          userId = existing.rows[0].id;
          skipped++;
        } else {
          const r = await db.query(
            `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'student') RETURNING id`,
            [u.name, u.email, '$2b$10$demoplaceholder' + Math.random().toString(36).slice(2)]
          );
          userId = r.rows[0].id;
          inserted++;
        }
        await db.query('DELETE FROM user_progress WHERE user_id = $1', [userId]);
        for (let m = 1; m <= u.modules; m++) {
          await db.query(
            `INSERT INTO user_progress (user_id, module_id, progress, completed_at)
             VALUES ($1, $2, 100, NOW())
             ON CONFLICT (user_id, module_id) DO UPDATE SET progress = 100, completed_at = NOW()`,
            [userId, m]
          );
        }
        const streak = Math.floor(u.modules / 3);
        if (streak > 0) {
          await db.query(
            `INSERT INTO streaks (user_id, current_streak, longest_streak, last_activity_date)
             VALUES ($1, $2, $2, CURRENT_DATE)
             ON CONFLICT (user_id) DO UPDATE SET current_streak = $2, longest_streak = GREATEST(streaks.longest_streak, $2), last_activity_date = CURRENT_DATE`,
            [userId, streak]
          );
        }
        await db.query('DELETE FROM scenario_scores WHERE user_id = $1', [userId]);
        const scenarios = Math.min(Math.floor(u.modules / 2), TOTAL_SCENARIOS);
        for (let sc = 1; sc <= scenarios; sc++) {
          await db.query(
            `INSERT INTO scenario_scores (user_id, scenario_id) VALUES ($1, $2)`,
            [userId, sc]
          );
        }
      } catch (err) {
        console.error('Demo seed error for', u.email, ':', err.message);
        errors.push(u.email + ': ' + err.message);
      }
    }
    console.log(`Demo users seeded: ${inserted} new, ${skipped} updated${errors.length ? ', ' + errors.length + ' errors' : ''}`);
    return { inserted, skipped, errors };
  }

  // ── Routes ────────────────────────────────────────────────────────────────────

  router.get('/api/admin/bootstrap', (req, res) => {
    res.status(410).json({ error: 'This endpoint has been disabled. Use /admin to grant access.' });
  });

  // ── Tenant management ─────────────────────────────────────────────────────────
  router.get('/api/admin/tenants', adminMiddleware, async (req, res) => {
    try {
      const result = await db.query(`
        SELECT
          r.id, r.name, r.invite_code,
          r.wl_brand_name, r.wl_logo_url, r.wl_primary_color, r.wl_accent_color,
          r.wl_is_active, r.wl_is_enterprise,
          u.email AS manager_email, u.name AS manager_name,
          COUNT(DISTINCT staff.id) AS team_size,
          COALESCE(ROUND(AVG(comp.pct)::numeric, 1), 0) AS avg_completion
        FROM restaurants r
        LEFT JOIN users u ON u.id = r.owner_id
        LEFT JOIN users staff ON staff.restaurant_id = r.id AND staff.role NOT IN ('manager','admin')
        LEFT JOIN (
          SELECT user_id, ROUND(100.0 * COUNT(*) FILTER (WHERE progress >= 100) / 30, 1) AS pct
          FROM user_progress GROUP BY user_id
        ) comp ON comp.user_id = staff.id
        WHERE r.wl_is_active = TRUE OR r.wl_is_enterprise = TRUE
        GROUP BY r.id, u.email, u.name
        ORDER BY r.wl_is_enterprise DESC, r.name
      `);
      res.json({ tenants: result.rows });
    } catch (e) { res.status(500).json({ error: 'Failed to load tenants' }); }
  });

  router.patch('/api/admin/tenants/:id/toggle', adminMiddleware, async (req, res) => {
    try {
      const r = await db.query(
        'UPDATE restaurants SET wl_is_active = NOT wl_is_active WHERE id = $1 RETURNING wl_is_active',
        [parseInt(req.params.id)]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Tenant not found' });
      res.json({ isActive: r.rows[0].wl_is_active });
    } catch (e) { res.status(500).json({ error: 'Failed to update tenant' }); }
  });

  router.patch('/api/admin/tenants/:id/enterprise', adminMiddleware, async (req, res) => {
    try {
      const r = await db.query(
        'UPDATE restaurants SET wl_is_enterprise = NOT wl_is_enterprise WHERE id = $1 RETURNING wl_is_enterprise',
        [parseInt(req.params.id)]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Tenant not found' });
      res.json({ isEnterprise: r.rows[0].wl_is_enterprise });
    } catch (e) { res.status(500).json({ error: 'Failed to update tenant' }); }
  });

  router.post('/api/admin/tenants', adminMiddleware, async (req, res) => {
    const { brandName, managerEmail, primaryColor } = req.body;
    if (!brandName) return res.status(400).json({ error: 'Brand name is required' });
    if (!managerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail)) return res.status(400).json({ error: 'Valid manager email is required' });
    if (primaryColor && !isValidHex(primaryColor)) return res.status(400).json({ error: 'Invalid color — use #rrggbb format' });
    try {
      const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      let managerUser = (await db.query('SELECT id, role FROM users WHERE email = $1', [managerEmail.toLowerCase()])).rows[0];
      if (!managerUser) {
        const tmpHash = await require('bcrypt').hash(Math.random().toString(36), 10);
        const trialEnd = new Date(); trialEnd.setFullYear(trialEnd.getFullYear() + 10);
        const ins = await db.query(
          `INSERT INTO users (email, password_hash, name, subscription_status, trial_ends_at, is_trial_active, role)
           VALUES ($1, $2, $3, 'enterprise', $4, false, 'manager') RETURNING id, role`,
          [managerEmail.toLowerCase(), tmpHash, brandName + ' Admin', trialEnd]
        );
        await db.query('INSERT INTO streaks (user_id) VALUES ($1)', [ins.rows[0].id]);
        managerUser = ins.rows[0];
      }
      const rIns = await db.query(
        `INSERT INTO restaurants (name, owner_id, invite_code, wl_brand_name, wl_primary_color, wl_is_active, wl_is_enterprise)
         VALUES ($1, $2, $3, $4, $5, TRUE, TRUE) RETURNING *`,
        [brandName, managerUser.id, inviteCode, brandName, primaryColor || null]
      );
      const restaurant = rIns.rows[0];
      await db.query("UPDATE users SET role = 'manager', restaurant_id = $1 WHERE id = $2", [restaurant.id, managerUser.id]);
      res.json({
        success: true,
        restaurant,
        inviteLink: `https://servemasteracademy.ca/signup?invite=${inviteCode}`,
      });
    } catch (e) {
      console.error('Create tenant error:', e.message);
      res.status(500).json({ error: 'Failed to create tenant' });
    }
  });

  // ── Config health / blog freshness ───────────────────────────────────────────
  router.get('/api/admin/config-health', adminMiddleware, (req, res) => {
    const critical = [
      { key: 'GOOGLE_CLIENT_ID',          feature: 'Google sign-in',                    setting: 'Google OAuth',        href: 'https://console.cloud.google.com/apis/credentials', section: null },
      { key: 'GOOGLE_CLIENT_SECRET',       feature: 'Google sign-in',                    setting: 'Google OAuth',        href: 'https://console.cloud.google.com/apis/credentials', section: null },
      { key: 'STRIPE_PREMIUM_MONTHLY_ID',  feature: 'individual monthly checkout',        setting: 'Stripe Price IDs',    href: 'https://dashboard.stripe.com/products',             section: null },
      { key: 'STRIPE_PREMIUM_ANNUAL_ID',   feature: 'individual annual checkout',         setting: 'Stripe Price IDs',    href: 'https://dashboard.stripe.com/products',             section: null },
      { key: 'STRIPE_STARTER_TEAM_ANNUAL_ID', feature: 'Starter Team annual checkout',   setting: 'Stripe Price IDs',    href: 'https://dashboard.stripe.com/products',             section: null },
      { key: 'STRIPE_PRO_TEAM_ANNUAL_ID',  feature: 'Pro Team annual checkout',           setting: 'Stripe Price IDs',    href: 'https://dashboard.stripe.com/products',             section: null },
      { key: 'STRIPE_WEBHOOK_SECRET',      feature: 'Stripe payment confirmations',       setting: 'Stripe Webhooks',     href: 'https://dashboard.stripe.com/webhooks',             section: 'payments' },
      { key: 'RESEND_API_KEY',             feature: 'transactional email delivery',       setting: 'Resend API Keys',     href: 'https://resend.com/api-keys',                       section: null },
    ];
    const missing = critical
      .filter(({ key }) => !String(process.env[key] || '').trim())
      .map(({ key, feature, setting, href, section }) => ({ key, feature, setting, href, section }));
    res.json({ ok: missing.length === 0, missing });
  });

  router.get('/api/admin/blog-freshness', adminMiddleware, (req, res) => {
    try {
      const { checkFreshness } = require('./lib/blogFreshness');
      const { stale } = checkFreshness();
      res.json({ stale });
    } catch (e) {
      res.json({ stale: [] });
    }
  });

  router.patch('/api/admin/blog-freshness/:slug', adminMiddleware, (req, res) => {
    try {
      const { slug } = req.params;
      if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
        return res.status(400).json({ error: 'Invalid slug' });
      }
      const { updateDateModified } = require('./lib/blogFreshness');
      const today = updateDateModified(slug);
      res.json({ ok: true, slug, dateModified: today });
    } catch (e) {
      if (e.message && e.message.startsWith('Slug not found')) {
        return res.status(404).json({ error: e.message });
      }
      res.status(500).json({ error: e.message });
    }
  });

  // ── Overview & users ──────────────────────────────────────────────────────────
  router.get('/api/admin/overview', adminMiddleware, async (req, res) => {
    try {
      const [users, new7d, new30d, active7d, tierCounts, teamCounts, subs, scenarios, modules, contacts] = await Promise.all([
        db.query('SELECT COUNT(*) as cnt FROM users'),
        db.query("SELECT COUNT(*) as cnt FROM users WHERE created_at > NOW() - INTERVAL '7 days'"),
        db.query("SELECT COUNT(*) as cnt FROM users WHERE created_at > NOW() - INTERVAL '30 days'"),
        db.query("SELECT COUNT(*) as cnt FROM users WHERE last_login > NOW() - INTERVAL '7 days'"),
        db.query("SELECT subscription_status, COUNT(*) as cnt FROM users GROUP BY subscription_status"),
        db.query("SELECT plan, COUNT(*) as cnt FROM restaurants WHERE plan != 'free' GROUP BY plan"),
        db.query('SELECT COUNT(*) as cnt FROM email_subscribers WHERE active = TRUE'),
        db.query('SELECT COUNT(*) as cnt FROM scenario_scores'),
        db.query('SELECT COUNT(*) as cnt FROM user_progress WHERE progress >= 100'),
        db.query('SELECT COUNT(*) as cnt FROM contact_messages'),
      ]);
      const byTier = {};
      tierCounts.rows.forEach(r => { byTier[r.subscription_status || 'free'] = parseInt(r.cnt); });
      const byTeam = {};
      teamCounts.rows.forEach(r => { byTeam[r.plan] = parseInt(r.cnt); });
      res.json({
        total_users:            parseInt(users.rows[0].cnt),
        new_users_7d:           parseInt(new7d.rows[0].cnt),
        new_users_30d:          parseInt(new30d.rows[0].cnt),
        active_users_7d:        parseInt(active7d.rows[0].cnt),
        free_users:             byTier['free'] || 0,
        premium_subscribers:    byTier['premium'] || 0,
        starter_team_locations: byTeam['starter_team'] || 0,
        pro_team_locations:     byTeam['pro_team'] || 0,
        enterprise_accounts:    byTier['enterprise'] || 0,
        newsletter_subs:        parseInt(subs.rows[0].cnt),
        scenarios_completed:    parseInt(scenarios.rows[0].cnt),
        modules_completed:      parseInt(modules.rows[0].cnt),
        contact_messages:       parseInt(contacts.rows[0].cnt),
      });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch overview' }); }
  });

  router.get('/api/admin/users', adminMiddleware, async (req, res) => {
    try {
      const result = await db.query(`
        SELECT u.id, u.name, u.email, u.role, u.subscription_status, u.created_at, u.last_login,
          COALESCE(SUM(p.progress)/30, 0) as avg_progress,
          COUNT(CASE WHEN p.progress >= 100 THEN 1 END) as modules_completed
        FROM users u
        LEFT JOIN user_progress p ON p.user_id = u.id
        GROUP BY u.id, u.name, u.email, u.role, u.subscription_status, u.created_at, u.last_login
        ORDER BY u.created_at DESC
        LIMIT 200
      `);
      res.json({ users: result.rows });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch users' }); }
  });

  router.patch('/api/admin/users/:id', adminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { plan, role } = req.body;
      const validPlans = ['free', 'premium', 'starter_team', 'pro_team', 'enterprise'];
      const validRoles = ['user', 'manager', 'admin'];
      if (!plan && !role) return res.status(400).json({ error: 'Provide plan and/or role' });
      if (plan && !validPlans.includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
      if (role && !validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
      const fields = [];
      const vals = [];
      if (plan) { fields.push(`subscription_status = $${vals.length + 1}`); vals.push(plan); }
      if (role) { fields.push(`role = $${vals.length + 1}`); vals.push(role); }
      vals.push(id);
      const result = await db.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${vals.length} RETURNING id, subscription_status, role`,
        vals
      );
      if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
      res.json({ success: true, user: result.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Failed to update user' }); }
  });

  router.delete('/api/admin/users/:id', adminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const check = await db.query('SELECT email, role FROM users WHERE id = $1', [id]);
      if (!check.rows.length) return res.status(404).json({ error: 'User not found' });
      if (check.rows[0].role === 'admin') return res.status(403).json({ error: 'Cannot delete an admin account' });
      await db.query('DELETE FROM user_progress WHERE user_id = $1', [id]);
      await db.query('DELETE FROM users WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to delete user' }); }
  });

  router.post('/api/admin/send-welcome-back', adminMiddleware, async (req, res) => {
    try {
      const { rows: users } = await db.query(`
        SELECT u.id, u.name, u.email, u.role, u.google_id, u.restaurant_id,
               r.name AS restaurant_name, r.invite_code,
               COUNT(p.module_id) FILTER (WHERE p.progress >= 100) AS modules_done
        FROM users u
        LEFT JOIN restaurants r ON r.id = u.restaurant_id
        LEFT JOIN user_progress p ON p.user_id = u.id
        WHERE u.email NOT LIKE '%@example.com%'
          AND u.email NOT LIKE '%@test.com%'
          AND u.is_unsubscribed = false
        GROUP BY u.id, u.name, u.email, u.role, u.google_id, u.restaurant_id, r.name, r.invite_code
      `);
      const sent = []; const failed = [];
      for (const u of users) {
        try {
          const loginMethod = u.google_id
            ? `<p style="font-size:15px;line-height:1.7;margin-bottom:16px;background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:14px;">👉 Click <strong>Sign in with Google</strong> on the login page — no password needed.</p>`
            : `<p style="font-size:15px;line-height:1.7;margin-bottom:16px;background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:14px;">👉 Log in with your email and your existing password at <a href="https://servemasteracademy.ca/login" style="color:#d4af37;">servemasteracademy.ca/login</a></p>`;
          const inviteSection = (u.role === 'manager' || u.role === 'admin') && u.invite_code
            ? `<div style="background:#1a1a1a;border:1px solid #d4af37;border-radius:12px;padding:20px;margin-bottom:24px;"><p style="font-size:14px;color:#a3a3a3;margin:0 0 6px;">Your restaurant invite code</p><p style="font-size:24px;font-weight:700;color:#d4af37;letter-spacing:4px;margin:0;">${u.invite_code}</p><p style="font-size:13px;color:#a3a3a3;margin:8px 0 0;">Share this with your staff so they can join ${escapeHtml(u.restaurant_name || 'your restaurant')} on ServeMaster Academy.</p></div>`
            : '';
          const progressNote = parseInt(u.modules_done) > 0
            ? `<p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Your progress is right where you left it — <strong>${u.modules_done} module${u.modules_done === '1' ? '' : 's'} completed</strong>. Pick up where you left off.</p>`
            : `<p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Your account is ready. Start with <strong>Module 1 — Foundations of Exceptional Service</strong> and work through the course at your own pace.</p>`;
          const html = `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
            <img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;">
            <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(u.name)},</p>
            <p style="font-size:16px;line-height:1.7;margin-bottom:16px;"><strong>ServeMaster Academy has a new home.</strong> We've upgraded the platform and moved to <a href="https://servemasteracademy.ca" style="color:#d4af37;">servemasteracademy.ca</a> — and your account and progress came with it.</p>
            ${progressNote}
            <p style="font-size:16px;line-height:1.7;margin-bottom:8px;">To log back in:</p>
            ${loginMethod}
            ${inviteSection}
            <p style="margin-bottom:32px;"><a href="https://servemasteracademy.ca/app" style="background:#FF5E3A;color:#fff;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Continue Training →</a></p>
            <p style="font-size:15px;line-height:1.7;color:#a3a3a3;">Warm regards,<br><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy</p>
          </div>`;
          await resend.emails.send({
            from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
            to: u.email,
            subject: 'ServeMaster Academy has a new home — your account is ready',
            html
          });
          sent.push(u.email);
        } catch (e) { failed.push({ email: u.email, error: e.message }); }
      }
      res.json({ ok: true, sent: sent.length, failed });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Module / newsletter / restaurant / contacts ───────────────────────────────
  router.get('/api/admin/modules', adminMiddleware, async (req, res) => {
    try {
      const result = await db.query(`
        SELECT module_id,
          COUNT(CASE WHEN progress >= 100 THEN 1 END) as completions,
          ROUND(AVG(quiz_score)::numeric, 1) as avg_quiz_score,
          ROUND(AVG(progress)::numeric, 1) as avg_progress
        FROM user_progress
        GROUP BY module_id ORDER BY module_id
      `);
      res.json({ modules: result.rows });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch module stats' }); }
  });

  router.get('/api/admin/newsletter', adminMiddleware, async (req, res) => {
    try {
      const { source } = req.query;
      const params = [];
      let where = 'WHERE active = TRUE';
      if (source) { params.push(source); where += ` AND source = $${params.length}`; }
      const result = await db.query(`SELECT email, first_name, source, created_at FROM email_subscribers ${where} ORDER BY created_at DESC`, params);
      res.json({ subscribers: result.rows });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch newsletter' }); }
  });

  router.get('/api/admin/newsletter/export.csv', adminMiddleware, async (req, res) => {
    try {
      const { source } = req.query;
      const params = [];
      let where = 'WHERE active = TRUE';
      if (source) { params.push(source); where += ` AND source = $${params.length}`; }
      const result = await db.query(`SELECT email, first_name, source, created_at FROM email_subscribers ${where} ORDER BY created_at DESC`, params);
      const rows = result.rows;
      const csv = ['email,first_name,source,subscribed_at', ...rows.map(r =>
        [r.email, r.first_name || '', r.source || 'newsletter', r.created_at ? new Date(r.created_at).toISOString() : ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
      )].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="newsletter-subscribers${source ? '-' + source : ''}.csv"`);
      res.send(csv);
    } catch (err) { res.status(500).json({ error: 'Failed to export newsletter' }); }
  });

  router.get('/api/admin/newsletter/book-launch-status', adminMiddleware, async (req, res) => {
    try {
      const result = await db.query(`
        SELECT
          COUNT(*) FILTER (WHERE active = TRUE AND source = 'covers-series') AS total,
          COUNT(*) FILTER (WHERE active = TRUE AND source = 'covers-series' AND book_launch_sent_at IS NULL) AS unsent,
          COUNT(*) FILTER (WHERE active = TRUE AND source = 'covers-series' AND book_launch_sent_at IS NOT NULL) AS sent
        FROM email_subscribers
      `);
      res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch book launch status' }); }
  });

  router.post('/api/admin/newsletter/send-book-launch', adminMiddleware, async (req, res) => {
    try {
      const subscribers = await db.query(`
        SELECT email, first_name FROM email_subscribers
        WHERE active = TRUE AND source = 'covers-series' AND book_launch_sent_at IS NULL
      `);
      if (!subscribers.rows.length) {
        return res.json({ sent: 0, message: 'No unsent subscribers.' });
      }
      const appUrl = process.env.APP_URL || 'https://servemasteracademy.ca';
      const errors = [];
      let sentCount = 0;
      for (const sub of subscribers.rows) {
        const firstName = sub.first_name ? sub.first_name.split(' ')[0] : null;
        const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hi,';
        try {
          await resend.emails.send({
            from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
            to: sub.email,
            subject: 'Eastern Sparks is here — Book 2 of the Covers series is now live',
            html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
  <img src="${appUrl}/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:28px;">
  <p style="font-size:16px;line-height:1.7;margin-bottom:20px;">${greeting}</p>
  <p style="font-size:16px;line-height:1.7;margin-bottom:20px;">You asked us to let you know — so here it is.</p>
  <div style="background:#1c1a14;border:1px solid rgba(251,191,36,0.25);border-radius:14px;padding:28px;margin:28px 0;text-align:center;">
    <p style="font-size:11px;color:#a3a3a3;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 10px;">Book 2 of the Covers Series</p>
    <h1 style="font-size:36px;font-weight:900;color:#fbbf24;margin:0 0 6px;font-family:'Montserrat',Georgia,sans-serif;letter-spacing:-0.02em;">Eastern <span style="color:#f5f5f5;">Sparks</span></h1>
    <p style="font-size:13px;color:#a3a3a3;margin:0 0 20px;">Tokyo &nbsp;·&nbsp; Bangkok &nbsp;·&nbsp; Singapore</p>
    <p style="font-size:15px;color:#d4d4d4;line-height:1.75;margin:0 0 24px;font-style:italic;">In Tokyo, Bangkok, and Singapore, Luca and Sofia finally speak — and the slow-burn romance ignites. But just as something real begins, life pulls them apart again.</p>
    <a href="${appUrl}/novels" style="display:inline-block;background:#fbbf24;color:#09090b;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;">Read Eastern Sparks →</a>
  </div>
  <p style="font-size:15px;color:#a3a3a3;line-height:1.7;margin-bottom:16px;">If you haven't finished <em>First Crossings</em> yet, you can <a href="${appUrl}/novels/first-crossings" style="color:#fbbf24;text-decoration:none;">catch up here</a> before diving into Book 2.</p>
  <p style="font-size:15px;color:#a3a3a3;line-height:1.7;margin-bottom:32px;">Enjoy the read.</p>
  <p style="font-size:15px;line-height:1.7;color:#a3a3a3;"><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy<br><a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#fbbf24;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a></p>
  <hr style="border:none;border-top:1px solid #27272a;margin:32px 0 20px;">
  <p style="font-size:11px;color:#52525b;line-height:1.6;">You're receiving this because you signed up for book launch notifications at servemasteracademy.ca. <a href="${appUrl}/unsubscribe?email=${encodeURIComponent(sub.email)}" style="color:#52525b;">Unsubscribe</a></p>
</div>`
          });
          await db.query(
            `UPDATE email_subscribers SET book_launch_sent_at = NOW() WHERE email = $1`,
            [sub.email]
          );
          sentCount++;
        } catch (emailErr) {
          console.error(`Book launch email error for ${sub.email}:`, emailErr.message);
          errors.push(sub.email);
        }
      }
      res.json({ sent: sentCount, errors: errors.length, failed: errors });
    } catch (err) {
      console.error('Send book launch error:', err.message);
      res.status(500).json({ error: 'Failed to send book launch emails' });
    }
  });

  router.get('/api/admin/restaurants', adminMiddleware, async (req, res) => {
    try {
      const result = await db.query(`
        SELECT r.id, r.name, r.invite_code, r.created_at, u.name as owner_name, u.email as owner_email,
          (SELECT COUNT(*) FROM users m WHERE m.restaurant_id = r.id) as staff_count
        FROM restaurants r JOIN users u ON u.id = r.owner_id ORDER BY r.created_at DESC
      `);
      res.json({ restaurants: result.rows });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch restaurants' }); }
  });

  router.get('/api/admin/contacts', adminMiddleware, async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100');
      res.json({ messages: result.rows });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch contacts' }); }
  });

  // ── Team trial requests ───────────────────────────────────────────────────────
  router.get('/api/admin/team-trial-requests', adminMiddleware, async (req, res) => {
    try {
      const result = await db.query(
        `SELECT id, name, email, message, provisioned, created_at,
                utm_source, utm_medium, utm_campaign, kirk_trial_digest_notified,
                invite_code, invite_code_sent_at
         FROM contact_messages
         WHERE message LIKE '[TEAM TRIAL REQUEST]%'
         ORDER BY created_at DESC`
      );
      res.json({ requests: result.rows });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch team trial requests' }); }
  });

  router.post('/api/admin/team-trial-requests/:id/provision', adminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid id' });
      const { provisioned } = req.body;
      const result = await db.query(
        `UPDATE contact_messages SET provisioned = $1 WHERE id = $2 AND message LIKE '[TEAM TRIAL REQUEST]%' RETURNING id`,
        [provisioned !== false, id]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Request not found' });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update trial request' }); }
  });

  router.post('/api/admin/team-trial-requests/:id/send-code', adminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid id' });

      const row = await db.query(
        `SELECT id, name, email, message FROM contact_messages WHERE id = $1 AND message LIKE '[TEAM TRIAL REQUEST]%'`,
        [id]
      );
      if (!row.rows.length) return res.status(404).json({ error: 'Trial request not found' });

      const { name, email, message } = row.rows[0];
      const parts = {};
      message.replace(/^\[TEAM TRIAL REQUEST\]\s*/, '').split('|').forEach(p => {
        const [k, ...v] = p.split(':');
        if (k && v.length) parts[k.trim()] = v.join(':').trim();
      });
      const restaurant = parts['Restaurant'] || '';

      const { plan: rawPlan = 'starter_team' } = req.body;
      const plan = rawPlan === 'pro_team' ? 'pro_team' : 'starter_team';
      const planLabel = plan === 'pro_team' ? 'Pro Team' : 'Starter Team';

      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      const code = `SMA-${part()}-${part()}`;

      await db.query(
        'INSERT INTO invite_codes (code, plan, max_uses, expires_at, access_days, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
        [code, plan, 999999, null, 30, req.user.id]
      );

      try {
        await resend.emails.send({
          from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
          to: email,
          subject: 'Your ServeMaster Academy team trial access code',
          html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
            <img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;">
            <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(name)},</p>
            <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Your 30-day ${escapeHtml(planLabel)} trial for <strong>${escapeHtml(restaurant || 'your restaurant')}</strong> is ready. Here's your access code — share it with your whole team so everyone can start training right away.</p>
            <div style="background:#1a1a1a;border:2px solid #d4af37;border-radius:12px;padding:24px;text-align:center;margin:28px 0;">
              <p style="font-size:12px;color:#a3a3a3;margin:0 0 8px;letter-spacing:0.08em;text-transform:uppercase;">Your Team Trial Access Code</p>
              <p style="font-size:32px;font-weight:700;color:#d4af37;letter-spacing:0.1em;margin:0;">${escapeHtml(code)}</p>
              <p style="font-size:12px;color:#a3a3a3;margin:12px 0 0;">Valid for 30 days &nbsp;·&nbsp; Unlimited team members</p>
            </div>
            <p style="font-size:15px;line-height:1.7;margin-bottom:20px;">To redeem, have each team member:</p>
            <ol style="font-size:15px;line-height:1.9;color:#d4d4d4;padding-left:20px;margin-bottom:24px;">
              <li>Create a free account at <a href="${APP_URL}/app" style="color:#d4af37;text-decoration:none;">servemasteracademy.ca/app</a></li>
              <li>Go to <strong>Settings → Redeem Code</strong> and enter the code above</li>
              <li>Start training immediately — all 30 modules, 150 AI scenarios, and voice practice unlocked</li>
            </ol>
            <p style="font-size:15px;line-height:1.7;color:#a3a3a3;margin-top:32px;">Any questions? Just reply to this email.<br><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy<br><a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#d4af37;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a></p>
          </div>`
        });
      } catch (emailErr) {
        console.error('send-code email failure, removing orphan code:', emailErr.message);
        await db.query('DELETE FROM invite_codes WHERE code = $1', [code]).catch(() => {});
        return res.status(500).json({ error: 'Failed to send email — please try again' });
      }

      await db.query(
        `UPDATE contact_messages SET provisioned = TRUE, invite_code = $2, invite_code_sent_at = NOW() WHERE id = $1`,
        [id, code]
      );
      res.json({ ok: true, code, plan });
    } catch (err) {
      console.error('send-code error:', err.message);
      res.status(500).json({ error: 'Failed to send access code' });
    }
  });

  // ── Invite codes ──────────────────────────────────────────────────────────────
  router.post('/api/admin/invite-codes', adminMiddleware, async (req, res) => {
    try {
      const { plan = 'premium', maxUses = 1, expiresAt, accessDays = 0 } = req.body;
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      const code = `SMA-${part()}-${part()}`;
      await db.query(
        'INSERT INTO invite_codes (code, plan, max_uses, expires_at, access_days, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
        [code, plan, maxUses === 0 ? 999999 : maxUses, expiresAt || null, accessDays > 0 ? accessDays : null, req.user.id]
      );
      res.json({ code });
    } catch (err) { res.status(500).json({ error: 'Failed to create invite code' }); }
  });

  router.get('/api/admin/invite-codes', adminMiddleware, async (req, res) => {
    try {
      const codes = await db.query(`
        SELECT ic.*, u.email as creator_email,
          COALESCE(json_agg(json_build_object('email', ru.email, 'redeemed_at', r.redeemed_at)) FILTER (WHERE r.id IS NOT NULL), '[]') as redeemers
        FROM invite_codes ic
        LEFT JOIN users u ON u.id = ic.created_by
        LEFT JOIN invite_code_redemptions r ON r.code = ic.code
        LEFT JOIN users ru ON ru.id = r.user_id
        GROUP BY ic.code, u.email
        ORDER BY ic.created_at DESC
      `);
      res.json({ codes: codes.rows });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch invite codes' }); }
  });

  router.patch('/api/admin/invite-codes/:code', adminMiddleware, async (req, res) => {
    const validPlans = ['free', 'premium', 'starter_team', 'pro_team', 'enterprise'];
    const { plan } = req.body;
    if (!plan || !validPlans.includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
    try {
      const r = await db.query('UPDATE invite_codes SET plan = $1 WHERE code = $2 RETURNING code', [plan, req.params.code]);
      if (!r.rows.length) return res.status(404).json({ error: 'Code not found' });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update invite code' }); }
  });

  router.delete('/api/admin/invite-codes/:code', adminMiddleware, async (req, res) => {
    try {
      await db.query('DELETE FROM invite_codes WHERE code = $1', [req.params.code]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: 'Failed to delete invite code' }); }
  });

  // ── Seed fake users ───────────────────────────────────────────────────────────
  router.post('/api/admin/seed-fake-users', adminMiddleware, async (req, res) => {
    try {
      const result = await seedDemoUsers();
      res.json({ ok: true, ...result });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Send email ────────────────────────────────────────────────────────────────
  router.post('/api/admin/send-email', adminMiddleware, async (req, res) => {
    const { emailType, userEmail } = req.body;
    if (!emailType || !userEmail) return res.status(400).json({ error: 'emailType and userEmail required' });
    try {
      const uRes = await db.query('SELECT name, email FROM users WHERE email = $1', [userEmail.toLowerCase()]);
      if (!uRes.rows.length) return res.status(404).json({ error: 'User not found' });
      const { name: rawName, email } = uRes.rows[0];
      const name = escapeHtml(rawName);
      const emailShell = (body) => `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
          <img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;">
          ${body}
          <hr style="border:none;border-top:1px solid #333;margin:32px 0;">
          <p style="font-size:12px;color:#666;line-height:1.6;">ServeMaster Academy · <a href="https://servemasteracademy.ca" style="color:#666;">servemasteracademy.ca</a></p>
        </div>`;
      const sig = `<p style="font-size:15px;line-height:1.7;color:#a3a3a3;margin-top:24px;">
        <strong style="color:#f5f5f5;">Kirk Adamson</strong><br>
        Founder, ServeMaster Academy<br>
        <a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#d4af37;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a></p>`;
      const btn = (label, href) => `<p style="margin-bottom:32px;"><a href="${href}" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">${label}</a></p>`;
      const p = (text) => `<p style="font-size:16px;line-height:1.7;margin-bottom:16px;">${text}</p>`;
      const emails = {
        welcome: {
          subject: 'Welcome to ServeMaster Academy – Your 14-day trial starts now',
          html: emailShell(`${p(`Hi ${name},`)}${p("I'm Kirk Adamson, founder of ServeMaster Academy.")}${p("Thank you for starting your free trial. I created this platform because I believe every guest deserves to feel truly cared for — and every server deserves the tools to make that happen.")}${p("Your 14-day journey begins now. I recommend starting with Module 1: Foundations of Exceptional Service.")}${btn("Start Module 1 Now", "https://servemasteracademy.ca/app")}${p("I'd love to hear what you think after your first session.")}${sig}`)
        },
        module2: {
          subject: "Module 1 complete — here's what's next",
          html: emailShell(`${p(`Hi ${name},`)}${p("After countless years enjoying fine dining, I've learned that the entire dining experience is often decided in the first 30 seconds.")}${p("The way a server greets the table, handles coats, and makes the guest feel seen — that single moment sets the tone for the whole evening.")}${p("Module 2 teaches exactly how to master that moment. Would you like to try it now?")}${btn("Continue to Module 2 →", "https://servemasteracademy.ca/app")}${p("Looking forward to hearing how it goes,")}${sig}`)
        },
        roleplay: {
          subject: 'Have you tried the AI role-play yet?',
          html: emailShell(`${p(`Hi ${name},`)}${p("One of the most powerful features in ServeMaster Academy is the AI role-play.")}${p("You speak your response to a real guest scenario (anniversary table, difficult customer, VIP) and get instant coaching.")}${p("It feels surprisingly real — and it's the fastest way to build confidence.")}${p("Try one scenario today — it only takes 2 minutes.")}${btn("Open AI Role-Play Now", "https://servemasteracademy.ca/app")}${sig}`)
        },
        day7: {
          subject: "You're halfway through your trial — here's what to try next",
          html: emailShell(`${p(`Hi ${name},`)}${p("You're now halfway through your 14-day trial.")}${p("Many users tell me that by Day 7 they already feel more confident handling wine service and special occasions.")}${p("If you haven't tried the Voice Practice yet, I highly recommend it — it's one of the features our early restaurant teams love most.")}${btn("Continue Training", "https://servemasteracademy.ca/app")}${sig}`)
        },
        day10: {
          subject: 'Your trial ends in 4 days — save 20% today',
          html: emailShell(`${p(`Hi ${name},`)}${p("Your 14-day free trial ends in just 4 days.")}${p("If you're enjoying the training and want to keep access to all 30 modules, the AI role-play, and the manager dashboard, now is a great time to upgrade.")}${p('Use code <strong style="color:#d4af37;font-size:18px;letter-spacing:1px;">LAUNCH20</strong> for 20% off your first month.')}${btn("Upgrade Now", "https://servemasteracademy.ca/pricing")}${sig}`)
        },
        day13: {
          subject: 'Your trial ends tomorrow — keep your access',
          html: emailShell(`${p(`Hi ${name},`)}${p("Your free trial ends tomorrow.")}${p("If you've found value in the training, I'd love for you to continue the journey with a full membership.")}${p('Use code <strong style="color:#d4af37;font-size:18px;letter-spacing:1px;">LAUNCH20</strong> for 20% off your first month or year.')}${btn("Keep Access →", "https://servemasteracademy.ca/pricing")}${sig}`)
        },
        expired: {
          subject: 'Your trial has ended — 20% off for the next 7 days',
          html: emailShell(`${p(`Hi ${name},`)}${p("Your 14-day trial has now ended.")}${p("Thank you for giving ServeMaster Academy a try. I hope you found the training valuable.")}${p('If you\'d like to continue, I\'ve extended a special 20% launch discount for another 7 days. Use code <strong style="color:#d4af37;font-size:18px;letter-spacing:1px;">LAUNCH20</strong> at checkout.')}${btn("Continue with 20% off", "https://servemasteracademy.ca/pricing")}${p("Questions? Just reply to this email — I read every one.")}${sig}`)
        }
      };
      const chosen = emails[emailType];
      if (!chosen) return res.status(400).json({ error: `Unknown emailType. Valid: ${Object.keys(emails).join(', ')}` });
      await resend.emails.send({
        from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
        to: email,
        subject: chosen.subject,
        html: chosen.html
      });
      res.json({ success: true, to: email, emailType });
    } catch (err) {
      console.error('Admin send-email error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Activation funnel ─────────────────────────────────────────────────────────
  router.get('/api/admin/funnel', adminMiddleware, async (req, res) => {
    try {
      const [signups, trialStarted, mod1, mod5, mod10, paid] = await Promise.all([
        db.query('SELECT COUNT(*) as cnt FROM users'),
        db.query("SELECT COUNT(*) as cnt FROM users WHERE trial_ends_at IS NOT NULL OR subscription_status != 'free' OR is_trial_active = true"),
        db.query('SELECT COUNT(DISTINCT user_id) as cnt FROM user_progress WHERE module_id = 1 AND progress >= 50'),
        db.query('SELECT COUNT(DISTINCT user_id) as cnt FROM user_progress WHERE module_id = 5 AND progress >= 100'),
        db.query('SELECT COUNT(DISTINCT user_id) as cnt FROM user_progress WHERE module_id = 10 AND progress >= 100'),
        db.query("SELECT COUNT(*) as cnt FROM users WHERE subscription_status NOT IN ('free') AND subscription_status IS NOT NULL"),
      ]);
      const total = parseInt(signups.rows[0].cnt) || 1;
      res.json({
        stages: [
          { label: 'Signed Up',          count: parseInt(signups.rows[0].cnt),     pct: 100 },
          { label: 'Started Trial',       count: parseInt(trialStarted.rows[0].cnt), pct: Math.round(parseInt(trialStarted.rows[0].cnt) / total * 100) },
          { label: 'Completed Module 1',  count: parseInt(mod1.rows[0].cnt),         pct: Math.round(parseInt(mod1.rows[0].cnt) / total * 100) },
          { label: 'Completed Module 5',  count: parseInt(mod5.rows[0].cnt),         pct: Math.round(parseInt(mod5.rows[0].cnt) / total * 100) },
          { label: 'Completed Module 10', count: parseInt(mod10.rows[0].cnt),        pct: Math.round(parseInt(mod10.rows[0].cnt) / total * 100) },
          { label: 'Converted to Paid',   count: parseInt(paid.rows[0].cnt),         pct: Math.round(parseInt(paid.rows[0].cnt) / total * 100) },
        ]
      });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch funnel data' }); }
  });

  // ── Dashboard summary ─────────────────────────────────────────────────────────
  router.get('/api/admin/dashboard-summary', adminMiddleware, async (req, res) => {
    try {
      const [
        usersRes, new7dRes, new30dRes, active7dRes, tierCountsRes,
        trialStartedRes, mod1Res, mod5Res, mod10Res, paidRes,
        scholarshipRes, affiliateRes, recentRes, newsletterRes, pendingTrialsRes,
        webhookSigFailureRes, pendingContactsRes
      ] = await Promise.all([
        db.query('SELECT COUNT(*) as cnt FROM users'),
        db.query("SELECT COUNT(*) as cnt FROM users WHERE created_at > NOW() - INTERVAL '7 days'"),
        db.query("SELECT COUNT(*) as cnt FROM users WHERE created_at > NOW() - INTERVAL '30 days'"),
        db.query("SELECT COUNT(*) as cnt FROM users WHERE last_login > NOW() - INTERVAL '7 days'"),
        db.query("SELECT subscription_status, COUNT(*) as cnt FROM users GROUP BY subscription_status"),
        db.query("SELECT COUNT(*) as cnt FROM users WHERE trial_ends_at IS NOT NULL OR subscription_status != 'free' OR is_trial_active = true"),
        db.query('SELECT COUNT(DISTINCT user_id) as cnt FROM user_progress WHERE module_id = 1 AND progress >= 50'),
        db.query('SELECT COUNT(DISTINCT user_id) as cnt FROM user_progress WHERE module_id = 5 AND progress >= 100'),
        db.query('SELECT COUNT(DISTINCT user_id) as cnt FROM user_progress WHERE module_id = 10 AND progress >= 100'),
        db.query("SELECT COUNT(*) as cnt FROM users WHERE subscription_status NOT IN ('free') AND subscription_status IS NOT NULL"),
        db.query('SELECT status, COUNT(*) as cnt FROM scholarship_applications GROUP BY status'),
        db.query(`SELECT
          COUNT(DISTINCT influencer_id) FILTER (WHERE status = 'payout_ready') AS affiliates_with_pending,
          COALESCE(SUM(amount_cad + COALESCE(activation_bonus,0)) FILTER (WHERE status = 'payout_ready'), 0) AS total_pending_cad,
          COALESCE(SUM(amount_cad) FILTER (WHERE status = 'pending'), 0) AS total_holding_cad
          FROM influencer_commissions`),
        db.query('SELECT id, name, email, subscription_status, created_at FROM users ORDER BY created_at DESC LIMIT 6'),
        db.query('SELECT COUNT(*) as cnt FROM email_subscribers WHERE active = TRUE'),
        db.query("SELECT COUNT(*) as cnt FROM contact_messages WHERE message LIKE '[TEAM TRIAL REQUEST]%' AND (provisioned IS NULL OR provisioned = FALSE)"),
        db.query("SELECT value FROM site_settings WHERE key = 'webhook_sig_failure'"),
        db.query("SELECT COUNT(*) as cnt FROM contact_messages WHERE message NOT LIKE '[TEAM TRIAL REQUEST]%'"),
      ]);

      const byTier = {};
      tierCountsRes.rows.forEach(r => { byTier[r.subscription_status || 'free'] = parseInt(r.cnt); });
      const schByStatus = {};
      scholarshipRes.rows.forEach(r => { schByStatus[r.status] = parseInt(r.cnt); });
      const total = parseInt(usersRes.rows[0].cnt) || 1;

      let stripeData = { mrr: 0, active_subscriptions: 0, revenue_30d: 0, failed_payments: 0 };
      try {
        const stripe = await getUncachableStripeClient();
        const [activeSubs, invoices30d, openInvoices] = await Promise.all([
          stripe.subscriptions.list({ status: 'active', limit: 100 }),
          stripe.invoices.list({ status: 'paid', limit: 100, created: { gte: Math.floor(Date.now() / 1000) - 30 * 86400 } }),
          stripe.invoices.list({ status: 'open', limit: 50 }),
        ]);
        const mrr = activeSubs.data.reduce((sum, sub) => {
          const item = sub.items?.data?.[0];
          if (!item) return sum;
          const amount = item.price?.unit_amount || 0;
          const interval = item.price?.recurring?.interval;
          return interval === 'year' ? sum + amount / 12 : sum + amount;
        }, 0);
        stripeData = {
          mrr: Math.round(mrr / 100),
          active_subscriptions: activeSubs.data.length,
          revenue_30d: Math.round(invoices30d.data.reduce((s, inv) => s + (inv.amount_paid || 0), 0) / 100),
          failed_payments: openInvoices.data.filter(inv => inv.attempt_count > 0).length,
        };
      } catch (stripeErr) { console.warn('Dashboard Stripe unavailable:', stripeErr.message); }

      res.json({
        generated_at: new Date().toISOString(),
        total_users:     total,
        new_users_7d:    parseInt(new7dRes.rows[0].cnt),
        new_users_30d:   parseInt(new30dRes.rows[0].cnt),
        active_users_7d: parseInt(active7dRes.rows[0].cnt),
        newsletter_subs: parseInt(newsletterRes.rows[0].cnt),
        plans: byTier,
        ...stripeData,
        scholarship: {
          pending:   schByStatus['pending']   || 0,
          approved:  schByStatus['approved']  || 0,
          completed: schByStatus['completed'] || 0,
          rejected:  schByStatus['rejected']  || 0,
        },
        affiliate: {
          affiliates_with_pending: parseInt(affiliateRes.rows[0].affiliates_with_pending) || 0,
          total_pending_cad:       parseFloat(affiliateRes.rows[0].total_pending_cad)     || 0,
          total_holding_cad:       parseFloat(affiliateRes.rows[0].total_holding_cad)     || 0,
        },
        webhook_sig_failure: (() => { try { return webhookSigFailureRes.rows.length > 0 ? JSON.parse(webhookSigFailureRes.rows[0].value) : null; } catch { return null; } })(),
        pending_trials:   parseInt(pendingTrialsRes.rows[0].cnt) || 0,
        pending_contacts: parseInt(pendingContactsRes.rows[0].cnt) || 0,
        funnel: [
          { label: 'Signed Up',          count: total, pct: 100 },
          { label: 'Started Trial',       count: parseInt(trialStartedRes.rows[0].cnt), pct: Math.round(parseInt(trialStartedRes.rows[0].cnt) / total * 100) },
          { label: 'Completed Mod 1',     count: parseInt(mod1Res.rows[0].cnt),         pct: Math.round(parseInt(mod1Res.rows[0].cnt) / total * 100) },
          { label: 'Completed Mod 5',     count: parseInt(mod5Res.rows[0].cnt),         pct: Math.round(parseInt(mod5Res.rows[0].cnt) / total * 100) },
          { label: 'Completed Mod 10',    count: parseInt(mod10Res.rows[0].cnt),        pct: Math.round(parseInt(mod10Res.rows[0].cnt) / total * 100) },
          { label: 'Converted to Paid',   count: parseInt(paidRes.rows[0].cnt),         pct: Math.round(parseInt(paidRes.rows[0].cnt) / total * 100) },
        ],
        recent_signups: recentRes.rows,
      });
    } catch (err) {
      console.error('Dashboard summary error:', err.message);
      res.status(500).json({ error: 'Failed to load dashboard' });
    }
  });

  // ── Module analytics ──────────────────────────────────────────────────────────
  router.get('/api/admin/analytics', adminMiddleware, async (req, res) => {
    try {
      const result = await db.query(`
        SELECT module_id,
          COUNT(DISTINCT user_id) as started,
          COUNT(CASE WHEN progress >= 100 THEN 1 END) as completed,
          ROUND(AVG(progress)::numeric, 1) as avg_progress,
          ROUND(AVG(quiz_score)::numeric, 1) as avg_quiz,
          COUNT(CASE WHEN progress >= 100 THEN 1 END)::float / NULLIF(COUNT(DISTINCT user_id), 0) * 100 as completion_rate
        FROM user_progress
        GROUP BY module_id ORDER BY module_id
      `);
      res.json({ modules: result.rows });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch analytics' }); }
  });

  // ── Weekly attribution ────────────────────────────────────────────────────────
  router.get('/api/admin/weekly-attribution', adminMiddleware, async (req, res) => {
    try {
      const data = await buildWeeklyAttribution();
      res.json(data);
    } catch (err) {
      console.error('Weekly attribution error:', err.message);
      res.status(500).json({ error: 'Failed to build weekly attribution' });
    }
  });

  router.get('/api/admin/weekly-attribution.csv', adminMiddleware, async (req, res) => {
    try {
      const data = await buildWeeklyAttribution();
      const lines = ['metric,utm_source,utm_medium,utm_campaign,count_7d,prior_7d,delta'];
      const push = (metric, rows) => rows.forEach(r => {
        const csvSafe = (v) => `"${String(v).replace(/"/g, '""')}"`;
        lines.push([metric, csvSafe(r.utm_source), csvSafe(r.utm_medium), csvSafe(r.utm_campaign), r.count, r.prior_count, r.delta].join(','));
      });
      push('signups', data.signups);
      push('team_requests', data.team_requests);
      push('free_to_premium', data.conversions);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="weekly-attribution-${data.period_start.slice(0,10)}.csv"`);
      res.send(lines.join('\n'));
    } catch (err) {
      console.error('Weekly attribution CSV error:', err.message);
      res.status(500).json({ error: 'Failed to export CSV' });
    }
  });

  // ── Manual digest triggers ────────────────────────────────────────────────────
  router.post('/api/admin/trigger-openclaw-digest', adminMiddleware, async (req, res) => {
    try { await sendOpenClawWeeklyDigest(); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: 'Failed to send digest' }); }
  });

  router.post('/api/admin/trigger-kirk-trial-digest', adminMiddleware, async (req, res) => {
    try {
      const result = await sendKirkTrialDigest();
      await db.query(
        `INSERT INTO site_settings (key, value) VALUES ('kirk_trial_digest_last_sent_at', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
        [new Date().toISOString()]
      );
      res.json({ success: true, ...result });
    } catch (e) { res.status(500).json({ error: 'Failed to send digest', detail: e.message }); }
  });

  router.post('/api/admin/trigger-weekly-digest', adminMiddleware, async (req, res) => {
    try {
      const { sent, skipped } = await sendWeeklyManagerDigests();
      res.json({ success: true, sent, skipped });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
  });

  // ── Site settings ─────────────────────────────────────────────────────────────
  router.get('/api/admin/site-settings', adminMiddleware, async (req, res) => {
    try {
      const r = await db.query(`SELECT key, value FROM site_settings`);
      const map = Object.fromEntries(r.rows.map(row => [row.key, row.value]));
      res.json(map);
    } catch (e) { res.status(500).json({ error: 'Failed to load settings' }); }
  });

  router.post('/api/admin/site-settings', adminMiddleware, async (req, res) => {
    try {
      const { key, value } = req.body;
      if (!key) return res.status(400).json({ error: 'key required' });
      if (key === 'kirk_trial_digest_hour_et') {
        const h = Number(value);
        if (!Number.isInteger(h) || h < 0 || h > 23) return res.status(400).json({ error: 'kirk_trial_digest_hour_et must be an integer 0–23' });
      }
      await db.query(
        `INSERT INTO site_settings (key, value, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
        [key, String(value)]
      );
      if (key === 'kirk_trial_digest_hour_et') {
        await db.query(
          `INSERT INTO site_settings (key, value, updated_at) VALUES ('kirk_trial_digest_last_sent_at','1970-01-01T00:00:00.000Z',NOW()) ON CONFLICT (key) DO UPDATE SET value='1970-01-01T00:00:00.000Z', updated_at=NOW()`
        );
      }
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Failed to save setting' }); }
  });

  // ── Scholarships ──────────────────────────────────────────────────────────────
  router.get('/api/admin/scholarships', adminMiddleware, async (req, res) => {
    try {
      const apps = await db.query(
        `SELECT id, name, email, phone, motivation, years_experience, status, applied_at, reviewed_at, invite_code, grad_at, share_contact,
                LEFT(testimonial, 200) as testimonial_preview
         FROM scholarship_applications
         ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END, applied_at DESC`
      );
      const spotsUsed = await getMonthlyApprovedCount();
      res.json({ applications: apps.rows, spots_used: spotsUsed, cap: SCHOLARSHIP_MONTHLY_CAP });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
  });

  router.post('/api/admin/scholarship/:id/approve', adminMiddleware, async (req, res) => {
    const appId = parseInt(req.params.id);
    if (!appId) return res.status(400).json({ error: 'Invalid application ID' });
    try {
      const appRes = await db.query('SELECT * FROM scholarship_applications WHERE id = $1', [appId]);
      if (!appRes.rows.length) return res.status(404).json({ error: 'Application not found' });
      const app = appRes.rows[0];
      if (app.status !== 'pending') return res.status(409).json({ error: `Application is already ${app.status}` });
      const monthlyCount = await getMonthlyApprovedCount();
      if (monthlyCount >= SCHOLARSHIP_MONTHLY_CAP) {
        return res.status(409).json({ error: `Monthly cap of ${SCHOLARSHIP_MONTHLY_CAP} scholarships reached. Wait until next month or increase the cap.` });
      }
      const code = genScholarshipCode();
      await db.query(
        `INSERT INTO invite_codes (code, plan, max_uses, expires_at, access_days, created_by) VALUES ($1, 'premium', 1, NULL, $2, $3)`,
        [code, SCHOLARSHIP_DAYS, req.user.id]
      );
      await db.query(
        `UPDATE scholarship_applications SET status = 'approved', invite_code = $1, reviewed_at = NOW() WHERE id = $2`,
        [code, appId]
      );
      const safeName = escapeHtml(app.name);
      resend.emails.send({
        from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
        to: app.email,
        subject: "You've been selected for the ServeMaster Career Launch Scholarship!",
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${safeName},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Congratulations — I've reviewed your application and I'm pleased to offer you the <strong style="color:#FF5E3A;">Career Launch Scholarship</strong>.</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">You now have <strong>60 days of full premium access</strong> to ServeMaster Academy — completely free.</p><p style="font-size:16px;line-height:1.7;margin-bottom:8px;"><strong>Here's how to get started:</strong></p><ol style="padding-left:20px;color:#d4d4d8;line-height:2;"><li>Create a free account at <a href="https://servemasteracademy.ca/signup" style="color:#FF5E3A;">servemasteracademy.ca/signup</a></li><li>Go to your profile and click "Redeem Invite Code"</li><li>Enter your scholarship code:</li></ol><div style="background:#1a1a1a;border:2px solid #FF5E3A;border-radius:12px;padding:20px;text-align:center;margin:24px 0;"><p style="font-size:13px;color:#a3a3a3;margin:0 0 8px;">Your Scholarship Code</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;color:#FF5E3A;margin:0;">${code}</p></div><p style="font-size:14px;color:#71717a;margin-bottom:24px;">This code is single-use and grants 60 days of full access. It does not expire — use it when you're ready to start.</p><p style="margin-bottom:32px;"><a href="https://servemasteracademy.ca/signup" style="background:#FF5E3A;color:#fff;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Create Account &amp; Start Training</a></p><p style="font-size:16px;line-height:1.7;margin-top:32px;color:#a3a3a3;"><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy</p><hr style="border:none;border-top:1px solid #333;margin:32px 0;"><p style="font-size:11px;color:#555;text-align:center;">ServeMaster Academy · <a href="https://servemasteracademy.ca" style="color:#555;">servemasteracademy.ca</a></p></div>`
      }).catch(e => console.error('Scholarship approval email error:', e.message));
      res.json({ success: true, code });
    } catch (e) {
      console.error('Scholarship approve error:', e.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  router.post('/api/admin/scholarship/:id/reject', adminMiddleware, async (req, res) => {
    const appId = parseInt(req.params.id);
    if (!appId) return res.status(400).json({ error: 'Invalid application ID' });
    try {
      const appRes = await db.query('SELECT * FROM scholarship_applications WHERE id = $1', [appId]);
      if (!appRes.rows.length) return res.status(404).json({ error: 'Application not found' });
      const app = appRes.rows[0];
      if (app.status !== 'pending') return res.status(409).json({ error: `Application is already ${app.status}` });
      await db.query(`UPDATE scholarship_applications SET status = 'rejected', reviewed_at = NOW() WHERE id = $1`, [appId]);
      const safeName = escapeHtml(app.name);
      resend.emails.send({
        from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
        to: app.email,
        subject: 'Your ServeMaster Academy scholarship application',
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${safeName},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Thank you for taking the time to apply for the Career Launch Scholarship. I reviewed your application personally.</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Unfortunately, we weren't able to offer you a scholarship spot at this time — we receive more applications than we have spaces each month, and it's a difficult selection process.</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">I encourage you to try again next month or take advantage of our free 14-day trial at <a href="https://servemasteracademy.ca/signup" style="color:#FF5E3A;">servemasteracademy.ca</a>.</p><p style="font-size:16px;line-height:1.7;margin-top:32px;color:#a3a3a3;"><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy</p><hr style="border:none;border-top:1px solid #333;margin:32px 0;"><p style="font-size:11px;color:#555;text-align:center;">ServeMaster Academy · <a href="https://servemasteracademy.ca" style="color:#555;">servemasteracademy.ca</a></p></div>`
      }).catch(e => console.error('Scholarship rejection email error:', e.message));
      res.json({ success: true });
    } catch (e) {
      console.error('Scholarship reject error:', e.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return { router, sendOpenClawWeeklyDigest, sendKirkTrialDigest };
};
