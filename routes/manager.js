'use strict';

const express = require('express');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const puppeteer = require('puppeteer');
const db      = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;

// ── Manager middleware ─────────────────────────────────────────────────────────

async function managerMiddleware(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length || !['manager', 'admin'].includes(rows[0].role)) {
      return res.status(403).json({ error: 'Manager access only' });
    }
    next();
  } catch (e) {
    if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    next(Object.assign(e, { publicMessage: 'Auth error' }));
  }
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

const MODULE_NAMES = {
  1: 'Service Foundations', 2: 'Menu Knowledge', 3: 'Wine Essentials',
  4: 'Beverage Mastery', 5: 'Upselling Techniques', 6: 'Tray & Posture',
  7: 'Allergy Awareness', 8: 'Guest Psychology', 9: 'Tableside Etiquette',
  10: 'POS & Billing', 11: 'Wine Service Advanced', 12: 'Floor Leadership',
  13: 'Spirits & Cocktails', 14: 'Coffee & Non-Alcoholic', 15: 'Allergen Mastery',
  16: 'EQ & Reading Guests', 17: 'Menu Knowledge Advanced', 18: 'Managing the Rush',
  19: 'Host & Reception Skills', 20: 'Cheese & Charcuterie', 21: 'Sustainability',
  22: 'Digital Tools & POS', 23: 'Team Culture', 24: 'Wellness & Career Growth',
  25: 'Bar Setup & Mise en Place', 26: 'Essential Bartending Techniques',
  27: 'Classic Cocktails & Drink Building', 28: 'Bar Upselling & Guest Engagement',
  29: 'Responsible Service & Difficult Situations', 30: 'Bar Career & Culture'
};

function calculateStatus(progressValues) {
  const avg = progressValues.length ? progressValues.reduce((a, b) => a + b, 0) / progressValues.length : 0;
  if (avg >= 90) return 'completed';
  if (avg >= 70) return 'on-track';
  if (avg >= 40) return 'lagging';
  return 'overdue';
}

/** Validate a hex color: must be #rrggbb or empty/null */
function isValidHex(v) { return !v || /^#[0-9a-fA-F]{6}$/.test(v); }

/** Build the standard branding response object from a restaurant row */
function buildBranding(row) {
  if (!row || !row.wl_is_active) return null;
  return {
    isActive:     true,
    brandName:    row.wl_brand_name   || row.name,
    logoUrl:      row.wl_logo_url     || null,
    primaryColor: row.wl_primary_color || null,
    accentColor:  row.wl_accent_color  || null,
  };
}

// ── Router factory ─────────────────────────────────────────────────────────────

module.exports = function createManagerRouter({ resend, authMiddleware, escapeHtml, getTenantBrandingForEmail, getOrCreateUnsubToken, emailFooter }) {
  const router = express.Router();

  // ── Restaurant / onboarding ──────────────────────────────────────────────────

  router.post('/api/manager/create-restaurant', authMiddleware, async (req, res, next) => {
    const { restaurantName } = req.body;
    if (!restaurantName) return res.status(400).json({ error: 'Restaurant name required' });
    try {
      const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const result = await db.query('INSERT INTO restaurants (name, owner_id, invite_code) VALUES ($1, $2, $3) RETURNING *', [restaurantName, req.user.id, inviteCode]);
      const restaurant = result.rows[0];
      await db.query("UPDATE users SET role = 'manager', restaurant_id = $1 WHERE id = $2", [restaurant.id, req.user.id]);
      res.json({ restaurant, inviteCode });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to create restaurant' })); }
  });

  router.post('/api/manager/join', authMiddleware, async (req, res, next) => {
    const { inviteCode } = req.body;
    if (!inviteCode) return res.status(400).json({ error: 'Invite code required' });
    try {
      const result = await db.query('SELECT * FROM restaurants WHERE invite_code = $1', [inviteCode.toUpperCase()]);
      if (!result.rows.length) return res.status(404).json({ error: 'Invalid invite code' });
      const restaurant = result.rows[0];
      await db.query('UPDATE users SET restaurant_id = $1 WHERE id = $2', [restaurant.id, req.user.id]);
      res.json({ success: true, restaurantName: restaurant.name });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to join restaurant' })); }
  });

  router.get('/api/manager/dashboard', authMiddleware, async (req, res, next) => {
    try {
      const userRes = await db.query('SELECT restaurant_id, role FROM users WHERE id = $1', [req.user.id]);
      const user = userRes.rows[0];
      if (!user || (user.role !== 'manager' && user.role !== 'admin')) return res.status(403).json({ error: 'Manager access only' });
      const restaurantRes = await db.query('SELECT * FROM restaurants WHERE id = $1', [user.restaurant_id]);
      const staffRes = await db.query(`
        SELECT u.id, u.name, u.email, u.experience_level, u.last_login,
          COUNT(CASE WHEN p.progress >= 100 THEN 1 END) as modules_completed,
          COALESCE(AVG(p.quiz_score), 0) as avg_score,
          (SELECT COUNT(*) FROM scenario_scores ss WHERE ss.user_id = u.id) as scenarios_done,
          COALESCE(s.current_streak, 0) as streak
        FROM users u
        LEFT JOIN user_progress p ON p.user_id = u.id
        LEFT JOIN streaks s ON s.user_id = u.id
        WHERE u.restaurant_id = $1 AND u.role != 'manager'
        GROUP BY u.id, u.name, u.email, u.experience_level, u.last_login, s.current_streak
        ORDER BY modules_completed DESC
      `, [user.restaurant_id]);
      res.json({ restaurant: restaurantRes.rows[0], staff: staffRes.rows });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to fetch dashboard' })); }
  });

  // ── White-label config ───────────────────────────────────────────────────────

  router.get('/api/manager/white-label', managerMiddleware, async (req, res, next) => {
    try {
      const uRes = await db.query('SELECT restaurant_id FROM users WHERE id = $1', [req.user.id]);
      if (!uRes.rows.length || !uRes.rows[0].restaurant_id) return res.json({ config: null });
      const rRes = await db.query(
        'SELECT name, wl_brand_name, wl_logo_url, wl_primary_color, wl_accent_color, wl_is_active FROM restaurants WHERE id = $1',
        [uRes.rows[0].restaurant_id]
      );
      const row = rRes.rows[0] || null;
      res.json({
        config: row ? {
          isActive:     row.wl_is_active,
          brandName:    row.wl_brand_name   || '',
          logoUrl:      row.wl_logo_url     || '',
          primaryColor: row.wl_primary_color || '',
          accentColor:  row.wl_accent_color  || '',
          restaurantName: row.name,
        } : null
      });
    } catch (e) { next(Object.assign(e, { publicMessage: 'Failed to load white-label config' })); }
  });

  router.post('/api/manager/white-label', managerMiddleware, async (req, res, next) => {
    const { brandName, logoUrl, primaryColor, accentColor, isActive } = req.body;
    if (primaryColor && !isValidHex(primaryColor)) return res.status(400).json({ error: 'Invalid primary color — use #rrggbb format' });
    if (accentColor  && !isValidHex(accentColor))  return res.status(400).json({ error: 'Invalid accent color — use #rrggbb format' });
    if (logoUrl && !/^https?:\/\/.+/.test(logoUrl)) return res.status(400).json({ error: 'Logo URL must start with http:// or https://' });
    try {
      const uRes = await db.query('SELECT restaurant_id FROM users WHERE id = $1', [req.user.id]);
      if (!uRes.rows.length || !uRes.rows[0].restaurant_id) return res.status(404).json({ error: 'No restaurant found for this account' });
      const rid = uRes.rows[0].restaurant_id;
      await db.query(
        `UPDATE restaurants SET
          wl_brand_name    = $1,
          wl_logo_url      = $2,
          wl_primary_color = $3,
          wl_accent_color  = $4,
          wl_is_active     = $5
         WHERE id = $6`,
        [brandName || null, logoUrl || null, primaryColor || null, accentColor || null, !!isActive, rid]
      );
      res.json({ success: true });
    } catch (e) { next(Object.assign(e, { publicMessage: 'Failed to save white-label config' })); }
  });

  // ── Tenant branding (public + auth) ─────────────────────────────────────────

  router.get('/api/tenant/branding/invite', async (req, res) => {
    const code = (req.query.code || '').toUpperCase();
    if (!code) return res.json({ branding: null });
    try {
      const rRes = await db.query(
        'SELECT name, wl_brand_name, wl_logo_url, wl_primary_color, wl_accent_color, wl_is_active FROM restaurants WHERE invite_code = $1',
        [code]
      );
      res.json({ branding: rRes.rows.length ? buildBranding(rRes.rows[0]) : null });
    } catch (e) { res.json({ branding: null }); }
  });

  router.get('/api/tenant/branding', authMiddleware, async (req, res) => {
    try {
      const uRes = await db.query('SELECT restaurant_id FROM users WHERE id = $1', [req.user.id]);
      if (!uRes.rows.length || !uRes.rows[0].restaurant_id) return res.json({ branding: null });
      const rRes = await db.query(
        'SELECT name, wl_brand_name, wl_logo_url, wl_primary_color, wl_accent_color, wl_is_active FROM restaurants WHERE id = $1',
        [uRes.rows[0].restaurant_id]
      );
      res.json({ branding: rRes.rows.length ? buildBranding(rRes.rows[0]) : null });
    } catch (e) { res.json({ branding: null }); }
  });

  // ── Team overview ────────────────────────────────────────────────────────────

  router.get('/api/team', managerMiddleware, async (req, res, next) => {
    try {
      const userRes = await db.query('SELECT restaurant_id, role FROM users WHERE id = $1', [req.user.id]);
      const user = userRes.rows[0];

      const isAdmin = user?.role === 'admin';
      const whereClause = isAdmin && !user?.restaurant_id
        ? "WHERE u.role NOT IN ('manager', 'admin')"
        : "WHERE u.restaurant_id = $1 AND u.role NOT IN ('manager', 'admin')";
      const params = isAdmin && !user?.restaurant_id ? [] : [user?.restaurant_id];

      const staffRes = await db.query(`
        SELECT u.id, u.name, u.email, u.last_login,
          COALESCE(AVG(p.progress), 0) as avg_progress,
          COUNT(CASE WHEN p.progress >= 100 THEN 1 END) as modules_completed,
          COALESCE(AVG(p.quiz_score), 0) as avg_quiz_score,
          (SELECT module_id FROM user_progress WHERE user_id = u.id ORDER BY progress DESC LIMIT 1) as strongest_module_id
        FROM users u
        LEFT JOIN user_progress p ON p.user_id = u.id
        ${whereClause}
        GROUP BY u.id, u.name, u.email, u.last_login
        ORDER BY avg_progress DESC
        LIMIT 100
      `, params);

      const staffIds = staffRes.rows.map(r => r.id);
      let scenarioCounts = {}, badgeCounts = {};
      if (staffIds.length) {
        const scRes = await db.query(
          `SELECT user_id, COUNT(*) as cnt FROM scenario_scores WHERE user_id = ANY($1) GROUP BY user_id`,
          [staffIds]
        );
        scRes.rows.forEach(r => { scenarioCounts[r.user_id] = parseInt(r.cnt); });
        const bdRes = await db.query(
          `SELECT user_id, COUNT(*) as cnt FROM badges WHERE user_id = ANY($1) GROUP BY user_id`,
          [staffIds]
        );
        bdRes.rows.forEach(r => { badgeCounts[r.user_id] = parseInt(r.cnt); });
      }

      const team = staffRes.rows.map(member => ({
        id: member.id,
        name: member.name || member.email,
        progress: Math.round(Number(member.avg_progress)),
        modules_completed: parseInt(member.modules_completed) || 0,
        avg_quiz_score: Math.round(Number(member.avg_quiz_score)) || 0,
        scenarios: scenarioCounts[member.id] || 0,
        badges: badgeCounts[member.id] || 0,
        last_login: member.last_login,
        strongest: MODULE_NAMES[member.strongest_module_id] || 'N/A',
        status: calculateStatus([Number(member.avg_progress)])
      }));

      res.json(team);
    } catch (err) {
      console.error('Team fetch error:', err.message);
      next(Object.assign(err, { publicMessage: 'Failed to fetch team' }));
    }
  });

  // ── Certificates ─────────────────────────────────────────────────────────────

  router.post('/api/certificate', managerMiddleware, async (req, res, next) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    try {
      const userRes = await db.query('SELECT id, name, email FROM users WHERE id = $1', [userId]);
      if (!userRes.rows.length) return res.status(404).json({ error: 'User not found' });
      const user = userRes.rows[0];

      for (let moduleId = 1; moduleId <= 30; moduleId++) {
        await db.query(`
          INSERT INTO user_progress (user_id, module_id, progress, quiz_score, completed_at)
          VALUES ($1, $2, 100, 100, NOW())
          ON CONFLICT (user_id, module_id)
          DO UPDATE SET
            progress = 100,
            quiz_score = GREATEST(user_progress.quiz_score, 100),
            completed_at = COALESCE(user_progress.completed_at, NOW())
        `, [userId, moduleId]);
      }
      await db.query(
        'INSERT INTO certificate_log (user_id, issued_by, issued_at) VALUES ($1, $2, NOW())',
        [userId, req.user.id]
      );
      res.json({ success: true, user: { name: user.name, email: user.email } });
    } catch (err) {
      console.error('Certificate error:', err.message);
      next(Object.assign(err, { publicMessage: 'Failed to issue certificate' }));
    }
  });

  router.get('/api/cert-token', authMiddleware, async (req, res, next) => {
    try {
      const { rows } = await db.query('SELECT cert_token FROM users WHERE id = $1', [req.user.id]);
      if (!rows.length) return res.status(404).json({ error: 'User not found' });
      let token = rows[0].cert_token;
      if (!token) {
        token = crypto.randomBytes(32).toString('hex');
        await db.query('UPDATE users SET cert_token = $1 WHERE id = $2', [token, req.user.id]);
      }
      res.json({ token });
    } catch (err) {
      console.error('cert-token error:', err.message);
      next(Object.assign(err, { publicMessage: 'Failed to get cert token' }));
    }
  });

  router.get('/api/verify/:token', async (req, res) => {
    const token = (req.params.token || '').replace(/[^a-zA-Z0-9]/g, '');
    if (!token) return res.json({ verified: false });
    try {
      const userRes = await db.query('SELECT id, name FROM users WHERE cert_token = $1', [token]);
      if (!userRes.rows.length) return res.json({ verified: false });
      const user = userRes.rows[0];
      const progressRes = await db.query(
        `SELECT COUNT(*) AS completed,
                MAX(completed_at) AS last_completed
         FROM user_progress
         WHERE user_id = $1 AND progress >= 100`,
        [user.id]
      );
      const completed = parseInt(progressRes.rows[0]?.completed || 0, 10);
      if (completed < 30) return res.json({ verified: false });
      res.json({
        verified: true,
        name: user.name || 'ServeMaster Graduate',
        modulesCompleted: completed,
        completedAt: progressRes.rows[0]?.last_completed || null
      });
    } catch (err) {
      console.error('verify error:', err.message);
      res.status(500).json({ verified: false });
    }
  });

  // ── Export report (CSV + PDF) ────────────────────────────────────────────────

  router.get('/api/export-report', managerMiddleware, async (req, res, next) => {
    try {
      const userRes = await db.query('SELECT restaurant_id, role FROM users WHERE id = $1', [req.user.id]);
      const user = userRes.rows[0];
      const isAdmin = user?.role === 'admin';
      const whereClause = isAdmin && !user?.restaurant_id
        ? "WHERE u.role NOT IN ('manager', 'admin')"
        : "WHERE u.restaurant_id = $1 AND u.role NOT IN ('manager', 'admin')";
      const params = isAdmin && !user?.restaurant_id ? [] : [user?.restaurant_id];
      const today = new Date().toISOString().split('T')[0];

      const staffRes = await db.query(`
        SELECT u.name, u.email, u.experience_level, u.last_login,
          COALESCE(AVG(p.progress), 0) as avg_progress,
          COUNT(CASE WHEN p.progress >= 100 THEN 1 END) as modules_completed,
          COALESCE(AVG(p.quiz_score), 0) as avg_quiz_score
        FROM users u
        LEFT JOIN user_progress p ON p.user_id = u.id
        ${whereClause}
        GROUP BY u.id, u.name, u.email, u.experience_level, u.last_login
        ORDER BY avg_progress DESC
      `, params);

      if (req.query.format === 'pdf') {
        const restRes = user.restaurant_id
          ? await db.query('SELECT name, cert_logo_url FROM restaurants WHERE id = $1', [user.restaurant_id])
          : { rows: [] };
        const rest = restRes.rows[0] || {};
        const restaurantName = rest.name || 'Team Report';
        const restaurantSlug = restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const logoUrl = rest.cert_logo_url || 'https://servemasteracademy.ca/logo.png';

        const totalMembers = staffRes.rows.length;
        const avgCompletion = totalMembers
          ? Math.round(staffRes.rows.reduce((s, r) => s + Number(r.avg_progress), 0) / totalMembers)
          : 0;
        const certifiedCount = staffRes.rows.filter(r => Number(r.avg_progress) >= 100).length;
        const needsAttention = staffRes.rows.filter(r => {
          const s = calculateStatus([Math.round(Number(r.avg_progress))]);
          return s === 'lagging' || s === 'overdue';
        }).length;

        const buckets = { '0–25%': 0, '26–50%': 0, '51–75%': 0, '76–99%': 0, '100%': 0 };
        staffRes.rows.forEach(r => {
          const p = Math.round(Number(r.avg_progress));
          if (p >= 100) buckets['100%']++;
          else if (p >= 76) buckets['76–99%']++;
          else if (p >= 51) buckets['51–75%']++;
          else if (p >= 26) buckets['26–50%']++;
          else buckets['0–25%']++;
        });
        const maxBucket = Math.max(...Object.values(buckets), 1);
        const distBars = Object.entries(buckets).map(([label, count]) => {
          const w = Math.round((count / maxBucket) * 100);
          const color = label === '100%' ? '#065f46' : label === '76–99%' ? '#14532d' : label === '51–75%' ? '#92400e' : label === '26–50%' ? '#9a3412' : '#7f1d1d';
          return `<tr><td style="padding:4px 8px;font-size:11px;white-space:nowrap;">${label}</td><td style="padding:4px 8px;width:180px;"><div style="background:#e5e7eb;border-radius:3px;height:12px;"><div style="background:${color};width:${w}%;height:12px;border-radius:3px;"></div></div></td><td style="padding:4px 8px;font-size:11px;text-align:right;">${count}</td></tr>`;
        }).join('');

        const moduleNamesArr = ['Service Foundations','Table Setup & Mise en Place','Welcoming Guests','Taking Orders','Serving Food & Timing','Wine Fundamentals','Wine Service Etiquette','Champagne & Sparkling','Beer & Non-Alcoholic','Cocktails & Spirits','Upselling Without Pressure','Handling Complaints','Special Dietary Needs','Table Management','Payment & Closing','VIP Service','Event & Banquet Service','Managing Side Duties','Working as a Team','Digital Menus & Tech','Culture & Inclusivity','Food Safety & Hygiene','Leadership & Mentorship','Wellness & Career','Bar Setup & Mise en Place','Essential Bartending','Classic Cocktails','Bar Upselling','Responsible Service','Bar Career & Culture'];
        const moduleStatsRes = await db.query(`
          SELECT p.module_id, ROUND(AVG(p.progress)::numeric, 1) as avg_progress
          FROM user_progress p
          JOIN users u ON u.id = p.user_id
          ${whereClause}
          GROUP BY p.module_id
          ORDER BY avg_progress DESC
          LIMIT 5
        `, params);
        const strongestModulesHtml = moduleStatsRes.rows.length
          ? `<table>${moduleStatsRes.rows.map(r => {
              const pct = Math.round(Number(r.avg_progress));
              const name = moduleNamesArr[r.module_id - 1] || ('Module ' + r.module_id);
              return `<tr><td style="padding:3px 8px;font-size:10px;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;">${name}</td><td style="padding:3px 8px;"><div style="background:#e5e7eb;border-radius:3px;height:10px;"><div style="background:#0A4D68;width:${pct}%;height:10px;border-radius:3px;"></div></div></td><td style="padding:3px 8px;font-size:10px;text-align:right;">${pct}%</td></tr>`;
            }).join('')}</table>`
          : '<p style="font-size:11px;color:#6b7280;">No module data yet.</p>';

        let tableRows = '';
        for (const row of staffRes.rows) {
          const avg = Math.round(Number(row.avg_progress));
          const status = calculateStatus([avg]);
          const lastLogin = row.last_login ? new Date(row.last_login).toLocaleDateString('en-CA') : 'Never';
          const statusColors = { completed:'background:#d1fae5;color:#065f46', 'on-track':'background:#fef3c7;color:#92400e', lagging:'background:#ffedd5;color:#9a3412', overdue:'background:#fee2e2;color:#991b1b' };
          const sc = statusColors[status] || 'background:#f3f4f6;color:#374151';
          tableRows += `<tr>
            <td>${escapeHtml(row.name||'')}</td>
            <td>${escapeHtml(row.email)}</td>
            <td>${escapeHtml(row.experience_level||'—')}</td>
            <td style="text-align:center">${avg}%</td>
            <td style="text-align:center">${row.modules_completed}/30</td>
            <td style="text-align:center">${Math.round(Number(row.avg_quiz_score))}%</td>
            <td>${lastLogin}</td>
            <td><span style="${sc};padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:600;">${status.replace('-',' ').replace(/\b\w/g,c=>c.toUpperCase())}</span></td>
          </tr>`;
        }

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
          *{box-sizing:border-box;margin:0;padding:0;}
          body{font-family:Georgia,serif;background:#fff;color:#1a1a1a;padding:32px;font-size:11px;}
          .header{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #0A4D68;padding-bottom:16px;margin-bottom:20px;}
          .brand{display:flex;align-items:center;gap:12px;}
          .brand img{width:40px;height:40px;border-radius:8px;object-fit:cover;}
          .brand-name{font-size:16px;font-weight:700;color:#0A4D68;}
          .brand-sub{font-size:10px;color:#6b7280;}
          .gen-date{font-size:10px;color:#6b7280;}
          .stats{display:flex;gap:8px;margin-bottom:20px;}
          .stat-box{flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:12px 10px;text-align:center;}
          .stat-val{font-size:22px;font-weight:700;color:#0A4D68;}
          .stat-val.green{color:#065f46;}
          .stat-val.red{color:#991b1b;}
          .stat-val.amber{color:#92400e;}
          .stat-lbl{font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-top:2px;}
          .two-col{display:flex;gap:16px;margin-bottom:20px;}
          .two-col>div{flex:1;}
          h3{font-size:11px;font-weight:700;color:#0A4D68;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;border-bottom:1px solid #e5e7eb;padding-bottom:4px;}
          table{width:100%;border-collapse:collapse;}
          th{background:#0A4D68;color:#fff;padding:6px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.04em;}
          td{padding:6px 8px;border-bottom:1px solid #f3f4f6;vertical-align:middle;}
          tr:nth-child(even) td{background:#f9fafb;}
          .footer{margin-top:20px;color:#9ca3af;font-size:9px;border-top:1px solid #e5e7eb;padding-top:8px;display:flex;justify-content:space-between;}
        </style></head><body>
          <div class="header">
            <div class="brand">
              <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(restaurantName)}" onerror="this.style.display='none'">
              <div>
                <div class="brand-name">${escapeHtml(restaurantName)}</div>
                <div class="brand-sub">Powered by ServeMaster Academy</div>
              </div>
            </div>
            <div class="gen-date">Team Training Report &mdash; ${today}</div>
          </div>
          <div class="stats">
            <div class="stat-box"><div class="stat-val">${totalMembers}</div><div class="stat-lbl">Team Members</div></div>
            <div class="stat-box"><div class="stat-val amber">${avgCompletion}%</div><div class="stat-lbl">Avg Completion</div></div>
            <div class="stat-box"><div class="stat-val green">${certifiedCount}</div><div class="stat-lbl">Certified</div></div>
            <div class="stat-box"><div class="stat-val red">${needsAttention}</div><div class="stat-lbl">Needs Attention</div></div>
          </div>
          <div class="two-col" style="margin-bottom:20px;">
            <div>
              <h3>Completion Distribution</h3>
              <table>${distBars}</table>
            </div>
            <div>
              <h3>Top 5 Strongest Modules</h3>
              ${strongestModulesHtml}
            </div>
          </div>
          <h3>Staff Progress</h3>
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Level</th><th>Avg Progress</th><th>Modules</th><th>Avg Quiz</th><th>Last Login</th><th>Status</th></tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
          <div class="footer">
            <span>ServeMaster Academy &mdash; servemasteracademy.ca</span>
            <span>Confidential &mdash; ${today}</span>
          </div>
        </body></html>`;

        const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu'] });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({ format: 'A4', landscape: false, margin: { top:'10mm', bottom:'10mm', left:'10mm', right:'10mm' } });
        await browser.close();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="team-report-${restaurantSlug}-${today}.pdf"`);
        return res.send(pdf);
      }

      let csv = 'Name,Email,Level,Avg Progress,Modules Completed,Avg Quiz Score,Last Login,Status\n';
      for (const row of staffRes.rows) {
        const avg = Math.round(Number(row.avg_progress));
        const status = calculateStatus([avg]);
        const lastLogin = row.last_login ? new Date(row.last_login).toLocaleDateString() : 'Never';
        csv += `"${row.name || ''}","${row.email}","${row.experience_level || ''}",${avg}%,${row.modules_completed},${Math.round(Number(row.avg_quiz_score))}%,"${lastLogin}","${status}"\n`;
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="team-report-${today}.csv"`);
      res.send(csv);
    } catch (err) {
      console.error('Export error:', err.message);
      next(Object.assign(err, { publicMessage: 'Failed to export report' }));
    }
  });

  // ── Digest preference ────────────────────────────────────────────────────────

  router.get('/api/manager/digest-preference', managerMiddleware, async (req, res, next) => {
    try {
      const r = await db.query('SELECT weekly_digest_enabled FROM users WHERE id = $1', [req.user.id]);
      res.json({ enabled: r.rows[0]?.weekly_digest_enabled !== false });
    } catch (e) { next(Object.assign(e, { publicMessage: 'Failed to fetch preference' })); }
  });

  router.put('/api/manager/digest-preference', managerMiddleware, async (req, res, next) => {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be boolean' });
    try {
      await db.query('UPDATE users SET weekly_digest_enabled = $1 WHERE id = $2', [enabled, req.user.id]);
      res.json({ success: true, enabled });
    } catch (e) { next(Object.assign(e, { publicMessage: 'Failed to save preference' })); }
  });

  // ── Staff detail ─────────────────────────────────────────────────────────────

  router.get('/api/manager/staff/:id', managerMiddleware, async (req, res, next) => {
    try {
      const staffId = parseInt(req.params.id);
      const userRes = await db.query('SELECT restaurant_id, role FROM users WHERE id = $1', [req.user.id]);
      const mgr = userRes.rows[0];
      const whereExtra = mgr.role === 'admin' && !mgr.restaurant_id ? '' : ' AND restaurant_id = $2';
      const params = mgr.role === 'admin' && !mgr.restaurant_id ? [staffId] : [staffId, mgr.restaurant_id];
      const staffRes = await db.query(
        `SELECT id, name, email, experience_level, last_login, created_at FROM users WHERE id = $1${whereExtra}`,
        params
      );
      if (!staffRes.rows.length) return res.status(404).json({ error: 'Staff member not found' });
      const [progressRes, scenarioRes, badgeRes, transcriptRes] = await Promise.all([
        db.query('SELECT module_id, progress, quiz_score, completed_at FROM user_progress WHERE user_id = $1 ORDER BY module_id', [staffId]),
        db.query('SELECT scenario_id, completed_at FROM scenario_scores WHERE user_id = $1 ORDER BY completed_at DESC', [staffId]),
        db.query('SELECT badge_id, earned_at FROM badges WHERE user_id = $1', [staffId]),
        db.query('SELECT id, scenario_id, verdict, completed_at FROM scenario_transcripts WHERE user_id = $1 ORDER BY completed_at DESC LIMIT 10', [staffId]),
      ]);
      res.json({
        staff: staffRes.rows[0],
        progress: progressRes.rows,
        scenarios: scenarioRes.rows,
        badges: badgeRes.rows,
        transcripts: transcriptRes.rows
      });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to fetch staff details' })); }
  });

  // ── Email nudge ──────────────────────────────────────────────────────────────

  router.post('/api/manager/nudge', managerMiddleware, async (req, res, next) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    try {
      const userRes = await db.query('SELECT name, email FROM users WHERE id = $1', [userId]);
      if (!userRes.rows.length) return res.status(404).json({ error: 'User not found' });
      const { name, email } = userRes.rows[0];
      const displayName = name || email.split('@')[0];
      const nudgeUnsubToken = await getOrCreateUnsubToken(userId);
      const nudgeUnsubUrl = `https://servemasteracademy.ca/unsubscribe?token=${nudgeUnsubToken}`;
      const wb = await getTenantBrandingForEmail(req.user.id);
      await resend.emails.send({
        from: wb.fromLine,
        to: email,
        subject: `Your ${wb.brandName} team wants you to keep training — you're almost there`,
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
          <img src="${wb.logoUrl}" alt="${escapeHtml(wb.brandName)}" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;">
          <p style="font-size:16px;line-height:1.7;">Hi ${escapeHtml(displayName)},</p>
          <p style="font-size:16px;line-height:1.7;">Your manager wanted to check in and encourage you to continue your ${escapeHtml(wb.brandName)} training.</p>
          <p style="font-size:16px;line-height:1.7;">Your team is making great progress — and every module you complete builds real skills you'll use on the floor every shift.</p>
          <p style="margin:32px 0;"><a href="https://servemasteracademy.ca/app" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Continue Training →</a></p>
          ${wb.poweredBy}
          ${emailFooter(nudgeUnsubUrl)}
        </div>`
      });
      res.json({ success: true, to: email });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to send nudge: ' + err.message })); }
  });

  // ── Training deadline ────────────────────────────────────────────────────────

  router.get('/api/manager/deadline', managerMiddleware, async (req, res, next) => {
    try {
      const userRes = await db.query('SELECT restaurant_id FROM users WHERE id = $1', [req.user.id]);
      const restaurantId = userRes.rows[0]?.restaurant_id;
      if (!restaurantId) return res.json({ deadline: null });
      const result = await db.query('SELECT training_deadline FROM restaurants WHERE id = $1', [restaurantId]);
      res.json({ deadline: result.rows[0]?.training_deadline || null });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to fetch deadline' })); }
  });

  router.post('/api/manager/deadline', managerMiddleware, async (req, res, next) => {
    const { deadline } = req.body;
    try {
      const userRes = await db.query('SELECT restaurant_id FROM users WHERE id = $1', [req.user.id]);
      const restaurantId = userRes.rows[0]?.restaurant_id;
      if (!restaurantId) return res.status(400).json({ error: 'No restaurant found' });
      await db.query('UPDATE restaurants SET training_deadline = $1 WHERE id = $2', [deadline || null, restaurantId]);
      res.json({ success: true });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to set deadline' })); }
  });

  // ── Certificate history ──────────────────────────────────────────────────────

  router.get('/api/manager/certificates', managerMiddleware, async (req, res, next) => {
    try {
      const userRes = await db.query('SELECT restaurant_id, role FROM users WHERE id = $1', [req.user.id]);
      const mgr = userRes.rows[0];
      let logs;
      if (mgr.role === 'admin' && !mgr.restaurant_id) {
        logs = await db.query(`
          SELECT cl.*, u.email as user_email, m.name as issuer_name
          FROM certificate_log cl
          JOIN users u ON u.id = cl.user_id
          LEFT JOIN users m ON m.id = cl.issued_by
          ORDER BY cl.issued_at DESC LIMIT 100
        `);
      } else {
        logs = await db.query(`
          SELECT cl.*, u.email as user_email, m.name as issuer_name
          FROM certificate_log cl
          JOIN users u ON u.id = cl.user_id AND u.restaurant_id = $1
          LEFT JOIN users m ON m.id = cl.issued_by
          ORDER BY cl.issued_at DESC LIMIT 100
        `, [mgr.restaurant_id]);
      }
      res.json({ certificates: logs.rows });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to fetch certificates' })); }
  });

  // ── Assigned modules ─────────────────────────────────────────────────────────

  router.get('/api/manager/assigned-modules', authMiddleware, async (req, res, next) => {
    try {
      const rr = await db.query('SELECT id FROM restaurants WHERE manager_id = $1', [req.user.id]);
      if (!rr.rows.length) return res.json({ modules: [] });
      const r = await db.query('SELECT module_id FROM assigned_modules WHERE restaurant_id = $1', [rr.rows[0].id]);
      res.json({ modules: r.rows.map(x => x.module_id) });
    } catch (e) { next(Object.assign(e, { publicMessage: 'Server error' })); }
  });

  router.post('/api/manager/assign', authMiddleware, async (req, res, next) => {
    const { moduleId } = req.body;
    if (!moduleId) return res.status(400).json({ error: 'Missing moduleId' });
    try {
      const rr = await db.query('SELECT id FROM restaurants WHERE manager_id = $1', [req.user.id]);
      if (!rr.rows.length) return res.status(404).json({ error: 'No restaurant found' });
      await db.query('INSERT INTO assigned_modules (restaurant_id, module_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [rr.rows[0].id, moduleId]);
      res.json({ success: true });
    } catch (e) { next(Object.assign(e, { publicMessage: 'Server error' })); }
  });

  router.delete('/api/manager/assign/:moduleId', authMiddleware, async (req, res, next) => {
    try {
      const rr = await db.query('SELECT id FROM restaurants WHERE manager_id = $1', [req.user.id]);
      if (!rr.rows.length) return res.status(404).json({ error: 'No restaurant found' });
      await db.query('DELETE FROM assigned_modules WHERE restaurant_id = $1 AND module_id = $2', [rr.rows[0].id, req.params.moduleId]);
      res.json({ success: true });
    } catch (e) { next(Object.assign(e, { publicMessage: 'Server error' })); }
  });

  router.get('/api/user/assigned-modules', authMiddleware, async (req, res, next) => {
    try {
      const userRes = await db.query('SELECT restaurant_id FROM users WHERE id = $1', [req.user.id]);
      const restaurantId = userRes.rows[0]?.restaurant_id;
      if (!restaurantId) return res.json({ modules: [] });
      const r = await db.query('SELECT module_id FROM assigned_modules WHERE restaurant_id = $1', [restaurantId]);
      res.json({ modules: r.rows.map(x => x.module_id) });
    } catch (e) { console.error('assigned-modules error:', e.message); next(Object.assign(e, { publicMessage: 'Server error' })); }
  });

  // ── Training plans ───────────────────────────────────────────────────────────

  router.post('/api/manager/training-plans', managerMiddleware, async (req, res, next) => {
    const { userId, title } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    try {
      const userRes = await db.query('SELECT restaurant_id FROM users WHERE id = $1', [req.user.id]);
      const restaurantId = userRes.rows[0]?.restaurant_id;
      if (!restaurantId) return res.status(400).json({ error: 'No restaurant found' });
      const staffCheck = await db.query(
        `SELECT id FROM users WHERE id = $1 AND restaurant_id = $2 AND role NOT IN ('manager','admin')`,
        [userId, restaurantId]
      );
      if (!staffCheck.rows.length) return res.status(403).json({ error: 'User is not a staff member of your restaurant' });
      const planTitle = (title || 'Onboarding Plan').slice(0, 100);
      const r = await db.query(
        `INSERT INTO training_plans (restaurant_id, user_id, title, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
        [restaurantId, userId, planTitle, req.user.id]
      );
      res.json({ plan: r.rows[0] });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to create plan: ' + err.message })); }
  });

  router.get('/api/manager/training-plans', managerMiddleware, async (req, res, next) => {
    try {
      const userRes = await db.query('SELECT restaurant_id, role FROM users WHERE id = $1', [req.user.id]);
      const mgr = userRes.rows[0];
      const restaurantId = mgr?.restaurant_id;
      if (!restaurantId) return res.json({ plans: [] });
      const plansRes = await db.query(
        `SELECT tp.*, u.name as staff_name, u.email as staff_email
         FROM training_plans tp
         JOIN users u ON u.id = tp.user_id
         WHERE tp.restaurant_id = $1
         ORDER BY tp.created_at DESC`,
        [restaurantId]
      );
      if (!plansRes.rows.length) return res.json({ plans: [] });
      const itemsRes = await db.query(
        `SELECT tpi.*, up.progress, up.quiz_score
         FROM training_plan_items tpi
         LEFT JOIN user_progress up ON up.module_id = tpi.module_id AND up.user_id = (
           SELECT tp2.user_id FROM training_plans tp2 WHERE tp2.id = tpi.plan_id
         )
         WHERE tpi.plan_id = ANY($1::int[])
         ORDER BY tpi.plan_id, tpi.position`,
        [plansRes.rows.map(p => p.id)]
      );
      const itemsByPlan = {};
      for (const item of itemsRes.rows) {
        if (!itemsByPlan[item.plan_id]) itemsByPlan[item.plan_id] = [];
        itemsByPlan[item.plan_id].push(item);
      }
      const plans = plansRes.rows.map(p => ({ ...p, items: itemsByPlan[p.id] || [] }));
      res.json({ plans });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to fetch plans: ' + err.message })); }
  });

  router.post('/api/manager/training-plans/:planId/items', managerMiddleware, async (req, res, next) => {
    const { moduleId, dueDate, position } = req.body;
    const planId = parseInt(req.params.planId);
    const moduleIdInt = parseInt(moduleId);
    if (!moduleId || isNaN(moduleIdInt) || moduleIdInt < 1 || moduleIdInt > 30) {
      return res.status(400).json({ error: 'moduleId must be a number between 1 and 30' });
    }
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return res.status(400).json({ error: 'dueDate must be in YYYY-MM-DD format' });
    }
    try {
      const userRes = await db.query('SELECT restaurant_id FROM users WHERE id = $1', [req.user.id]);
      const restaurantId = userRes.rows[0]?.restaurant_id;
      const planCheck = await db.query('SELECT id FROM training_plans WHERE id = $1 AND restaurant_id = $2', [planId, restaurantId]);
      if (!planCheck.rows.length) return res.status(404).json({ error: 'Plan not found' });
      const posRes = await db.query('SELECT COALESCE(MAX(position),0)+1 as pos FROM training_plan_items WHERE plan_id = $1', [planId]);
      const pos = position ?? posRes.rows[0].pos;
      const r = await db.query(
        `INSERT INTO training_plan_items (plan_id, module_id, position, due_date) VALUES ($1,$2,$3,$4) RETURNING *`,
        [planId, moduleId, pos, dueDate || null]
      );
      res.json({ item: r.rows[0] });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to add item: ' + err.message })); }
  });

  router.delete('/api/manager/training-plans/:planId/items/:itemId', managerMiddleware, async (req, res, next) => {
    const planId = parseInt(req.params.planId);
    const itemId = parseInt(req.params.itemId);
    try {
      const userRes = await db.query('SELECT restaurant_id FROM users WHERE id = $1', [req.user.id]);
      const restaurantId = userRes.rows[0]?.restaurant_id;
      const planCheck = await db.query('SELECT id FROM training_plans WHERE id = $1 AND restaurant_id = $2', [planId, restaurantId]);
      if (!planCheck.rows.length) return res.status(404).json({ error: 'Plan not found' });
      await db.query('DELETE FROM training_plan_items WHERE id = $1 AND plan_id = $2', [itemId, planId]);
      res.json({ success: true });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to remove item: ' + err.message })); }
  });

  router.delete('/api/manager/training-plans/:planId', managerMiddleware, async (req, res, next) => {
    const planId = parseInt(req.params.planId);
    try {
      const userRes = await db.query('SELECT restaurant_id FROM users WHERE id = $1', [req.user.id]);
      const restaurantId = userRes.rows[0]?.restaurant_id;
      await db.query('DELETE FROM training_plans WHERE id = $1 AND restaurant_id = $2', [planId, restaurantId]);
      res.json({ success: true });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to delete plan: ' + err.message })); }
  });

  router.get('/api/user/training-plan', authMiddleware, async (req, res, next) => {
    try {
      const planRes = await db.query(
        `SELECT tp.id, tp.title, tp.created_at, u.name as manager_name
         FROM training_plans tp
         JOIN users u ON u.id = tp.created_by
         WHERE tp.user_id = $1
         ORDER BY tp.created_at DESC LIMIT 1`,
        [req.user.id]
      );
      if (!planRes.rows.length) return res.json({ plan: null });
      const plan = planRes.rows[0];
      const itemsRes = await db.query(
        `SELECT tpi.id, tpi.module_id, tpi.position, tpi.due_date,
                up.progress, up.quiz_score, up.completed_at
         FROM training_plan_items tpi
         LEFT JOIN user_progress up ON up.module_id = tpi.module_id AND up.user_id = $1
         WHERE tpi.plan_id = $2
         ORDER BY tpi.position`,
        [req.user.id, plan.id]
      );
      res.json({ plan: { ...plan, items: itemsRes.rows } });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to fetch training plan: ' + err.message })); }
  });

  // ── Skill-gap report ─────────────────────────────────────────────────────────

  router.get('/api/manager/skill-gap', managerMiddleware, async (req, res, next) => {
    const ALL_MODULE_IDS = Array.from({ length: 30 }, (_, i) => i + 1);
    try {
      const userRes = await db.query('SELECT restaurant_id, role FROM users WHERE id = $1', [req.user.id]);
      const mgr = userRes.rows[0];
      const restaurantId = mgr?.restaurant_id;
      if (!restaurantId) return res.json({ modules: [], staff: [] });
      const staffRes = await db.query(
        `SELECT id, name FROM users WHERE restaurant_id = $1 AND role NOT IN ('manager','admin')`,
        [restaurantId]
      );
      if (!staffRes.rows.length) return res.json({ modules: [], staff: staffRes.rows });
      const staffIds = staffRes.rows.map(s => s.id);
      const totalStaff = staffRes.rows.length;
      const progressRes = await db.query(
        `SELECT module_id,
                ROUND(AVG(quiz_score) FILTER (WHERE quiz_score IS NOT NULL)::numeric,1) as avg_quiz,
                COUNT(DISTINCT user_id) FILTER (WHERE quiz_score IS NOT NULL) as attempted,
                COUNT(CASE WHEN progress >= 100 THEN 1 END) as completed,
                array_agg(DISTINCT user_id) FILTER (WHERE quiz_score IS NOT NULL) as attempted_user_ids
         FROM user_progress
         WHERE user_id = ANY($1::int[])
         GROUP BY module_id`,
        [staffIds]
      );
      const progressByModule = {};
      for (const row of progressRes.rows) {
        progressByModule[row.module_id] = row;
      }
      const modulesData = ALL_MODULE_IDS.map(moduleId => {
        const row = progressByModule[moduleId];
        if (!row || row.avg_quiz === null) {
          return {
            module_id: moduleId,
            avg_quiz: null,
            attempted: row ? parseInt(row.attempted) : 0,
            completed: row ? parseInt(row.completed) : 0,
            total_staff: totalStaff,
            not_attempted: staffRes.rows.map(s => s.name)
          };
        }
        const attemptedIds = row.attempted_user_ids || [];
        const notAttempted = staffRes.rows.filter(s => !attemptedIds.includes(s.id)).map(s => s.name);
        return {
          module_id: moduleId,
          avg_quiz: parseFloat(row.avg_quiz),
          attempted: parseInt(row.attempted),
          completed: parseInt(row.completed),
          total_staff: totalStaff,
          not_attempted: notAttempted
        };
      });
      modulesData.sort((a, b) => {
        if (a.avg_quiz === null && b.avg_quiz === null) return a.module_id - b.module_id;
        if (a.avg_quiz === null) return 1;
        if (b.avg_quiz === null) return -1;
        return a.avg_quiz - b.avg_quiz;
      });
      res.json({ modules: modulesData, staff: staffRes.rows });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to fetch skill gap: ' + err.message })); }
  });

  // ── Certificate logo ─────────────────────────────────────────────────────────

  router.get('/api/manager/cert-logo', authMiddleware, async (req, res, next) => {
    try {
      const rr = await db.query('SELECT cert_logo_url FROM restaurants WHERE manager_id = $1', [req.user.id]);
      res.json({ certLogoUrl: rr.rows[0]?.cert_logo_url || '' });
    } catch (e) { next(Object.assign(e, { publicMessage: 'Server error' })); }
  });

  router.post('/api/manager/cert-logo', authMiddleware, async (req, res, next) => {
    const { certLogoUrl } = req.body;
    try {
      await db.query('UPDATE restaurants SET cert_logo_url = $1 WHERE manager_id = $2', [certLogoUrl || null, req.user.id]);
      res.json({ success: true });
    } catch (e) { next(Object.assign(e, { publicMessage: 'Server error' })); }
  });

  // ── Graduates ────────────────────────────────────────────────────────────────

  router.get('/api/manager/graduates', managerMiddleware, async (req, res, next) => {
    try {
      const grads = await db.query(
        `SELECT sa.id, sa.name, sa.email, sa.phone, sa.testimonial, sa.grad_at, sa.share_contact
         FROM scholarship_applications sa
         WHERE sa.status = 'completed' AND sa.share_contact = TRUE
         ORDER BY sa.grad_at DESC`
      );
      res.json({ graduates: grads.rows });
    } catch (e) { next(Object.assign(e, { publicMessage: 'Server error' })); }
  });

  return router;
};
