const express = require('express');

const SCHOLARSHIP_MONTHLY_CAP = 15;
const SCHOLARSHIP_DAYS = 60;
const TOTAL_MODULES = 30;
const TOTAL_SCENARIOS = 36;
const WELCOME_BONUS_CAD = 100;
const KIRK_DIGEST_EMAIL = 'kirk_adamson@servemasteracademy.ca';

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

  // ── Weekly attribution helpers ────────────────────────────────────────────────
  function _mostRecentMondayMidnightET(now) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Toronto', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short'
    });
    const parts = fmt.formatToParts(now).reduce((a, p) => (a[p.type] = p.value, a), {});
    const wdMap = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
    const wd = wdMap[parts.weekday] ?? 1;
    const daysSinceMon = (wd + 6) % 7;
    let candidate = new Date(Date.UTC(
      parseInt(parts.year), parseInt(parts.month) - 1, parseInt(parts.day) - daysSinceMon,
      5, 0, 0
    ));
    for (let i = 0; i < 3; i++) {
      const c = fmt.formatToParts(candidate).reduce((a, p) => (a[p.type] = p.value, a), {});
      const drift = (parseInt(c.hour) * 3600 + parseInt(c.minute) * 60 + parseInt(c.second));
      if (drift === 0) break;
      candidate = new Date(candidate.getTime() - drift * 1000);
    }
    return candidate;
  }

  async function buildWeeklyAttribution() {
    const now = new Date();
    const periodEnd = _mostRecentMondayMidnightET(now);
    const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    const priorEnd = periodStart;
    const priorStart = new Date(priorEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

    const norm = (r) => ({
      utm_source: r.utm_source || '(direct)',
      utm_medium: r.utm_medium || '(none)',
      utm_campaign: r.utm_campaign || '(none)',
      count: parseInt(r.cnt) || 0,
    });

    async function agg(sql, start, end) {
      const r = await db.query(sql, [start, end]);
      return r.rows.map(norm);
    }

    const signupSql = `
      SELECT utm_source, utm_medium, utm_campaign, COUNT(*) AS cnt
      FROM users
      WHERE created_at >= $1 AND created_at < $2
      GROUP BY utm_source, utm_medium, utm_campaign
      ORDER BY cnt DESC`;
    const teamReqSql = `
      SELECT utm_source, utm_medium, utm_campaign, COUNT(*) AS cnt
      FROM contact_messages
      WHERE created_at >= $1 AND created_at < $2
        AND message LIKE '[TEAM TRIAL REQUEST]%'
      GROUP BY utm_source, utm_medium, utm_campaign
      ORDER BY cnt DESC`;
    const conversionSql = `
      SELECT utm_source, utm_medium, utm_campaign, COUNT(*) AS cnt
      FROM users
      WHERE paid_started_at >= $1 AND paid_started_at < $2
      GROUP BY utm_source, utm_medium, utm_campaign
      ORDER BY cnt DESC`;

    const [
      signupsCur, signupsPrev,
      teamCur, teamPrev,
      convCur, convPrev,
    ] = await Promise.all([
      agg(signupSql, periodStart, periodEnd),
      agg(signupSql, priorStart, priorEnd),
      agg(teamReqSql, periodStart, periodEnd),
      agg(teamReqSql, priorStart, priorEnd),
      agg(conversionSql, periodStart, periodEnd),
      agg(conversionSql, priorStart, priorEnd),
    ]);

    function diffRows(curRows, prevRows) {
      const key = (r) => r.utm_source + '|' + r.utm_medium + '|' + r.utm_campaign;
      const prevMap = {};
      prevRows.forEach(r => { prevMap[key(r)] = r.count; });
      const seen = {};
      const merged = curRows.map(r => {
        seen[key(r)] = true;
        const prev = prevMap[key(r)] || 0;
        return {
          utm_source: r.utm_source, utm_medium: r.utm_medium, utm_campaign: r.utm_campaign,
          count: r.count, prior_count: prev, delta: r.count - prev,
        };
      });
      prevRows.forEach(r => {
        if (!seen[key(r)]) {
          merged.push({
            utm_source: r.utm_source, utm_medium: r.utm_medium, utm_campaign: r.utm_campaign,
            count: 0, prior_count: r.count, delta: -r.count,
          });
        }
      });
      return merged.sort((a, b) => b.count - a.count || b.prior_count - a.prior_count);
    }

    const signupsRows = diffRows(signupsCur, signupsPrev);
    const teamRows    = diffRows(teamCur, teamPrev);
    const convRows    = diffRows(convCur, convPrev);

    const sumCount = (rows) => rows.reduce((s, r) => s + r.count, 0);
    const sumPrior = (rows) => rows.reduce((s, r) => s + r.prior_count, 0);

    const totals = {
      signups:       { current: sumCount(signupsRows), prior: sumPrior(signupsRows) },
      team_requests: { current: sumCount(teamRows),    prior: sumPrior(teamRows)    },
      conversions:   { current: sumCount(convRows),    prior: sumPrior(convRows)    },
    };

    const campaignScore = {};
    signupsRows.forEach(r => {
      const k = r.utm_source + ' / ' + r.utm_campaign;
      campaignScore[k] = (campaignScore[k] || 0) + r.count;
    });
    convRows.forEach(r => {
      const k = r.utm_source + ' / ' + r.utm_campaign;
      campaignScore[k] = (campaignScore[k] || 0) + r.count * 5;
    });
    const topCampaignKey = Object.keys(campaignScore).sort((a, b) => campaignScore[b] - campaignScore[a])[0] || null;

    return {
      generated_at: now.toISOString(),
      period_start: periodStart.toISOString(),
      period_end:   periodEnd.toISOString(),
      prior_start:  priorStart.toISOString(),
      prior_end:    priorEnd.toISOString(),
      totals,
      signups:       signupsRows,
      team_requests: teamRows,
      conversions:   convRows,
      top_campaign:  topCampaignKey,
    };
  }

  function _renderAttributionDigestHtml(data) {
    const fmtPct = (cur, prev) => {
      if (!prev) return cur > 0 ? '<span style="color:#10b981;">new</span>' : '<span style="color:#71717a;">—</span>';
      const pct = Math.round(((cur - prev) / prev) * 100);
      const colour = pct >= 0 ? '#10b981' : '#ef4444';
      const sign = pct >= 0 ? '+' : '';
      return `<span style="color:${colour};font-weight:600;">${sign}${pct}%</span>`;
    };
    const fmtRange = (start, end) => {
      const s = new Date(start), e = new Date(end);
      const opt = { month: 'short', day: 'numeric', timeZone: 'America/Toronto' };
      return s.toLocaleDateString('en-CA', opt) + ' – ' + e.toLocaleDateString('en-CA', opt);
    };
    function renderTable(title, rows) {
      if (!rows.length) {
        return `<h3 style="font-family:Montserrat,sans-serif;color:#FF5E3A;margin:24px 0 8px;">${title}</h3>
          <p style="color:#71717a;font-size:14px;margin:4px 0 0;">0 this week.</p>`;
      }
      const trs = rows.slice(0, 12).map(r => `
        <tr>
          <td style="padding:6px 12px 6px 0;font-size:13px;">${escapeHtml(r.utm_source)}</td>
          <td style="padding:6px 12px 6px 0;font-size:13px;color:#a1a1aa;">${escapeHtml(r.utm_medium)}</td>
          <td style="padding:6px 12px 6px 0;font-size:13px;color:#a1a1aa;">${escapeHtml(r.utm_campaign)}</td>
          <td style="padding:6px 0;font-size:13px;font-weight:600;text-align:right;">${r.count}</td>
          <td style="padding:6px 0 6px 12px;font-size:12px;color:#71717a;text-align:right;">prev ${r.prior_count}</td>
        </tr>`).join('');
      return `<h3 style="font-family:Montserrat,sans-serif;color:#FF5E3A;margin:24px 0 8px;">${title}</h3>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="border-bottom:1px solid #27272a;">
            <th style="text-align:left;padding:6px 0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Source</th>
            <th style="text-align:left;padding:6px 0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Medium</th>
            <th style="text-align:left;padding:6px 0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Campaign</th>
            <th style="text-align:right;padding:6px 0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">7d</th>
            <th style="text-align:right;padding:6px 0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Δ</th>
          </tr></thead>
          <tbody>${trs}</tbody>
        </table>`;
    }
    const adminUrl = `${APP_URL}/admin#attribution`;
    const totals = data.totals;
    const headlineRow = (label, t) => `
      <tr>
        <td style="padding:8px 0;font-size:14px;color:#a1a1aa;">${label}</td>
        <td style="padding:8px 0;font-size:18px;font-weight:700;text-align:right;">${t.current}</td>
        <td style="padding:8px 0 8px 16px;font-size:13px;text-align:right;">${fmtPct(t.current, t.prior)}</td>
      </tr>`;
    return `<div style="font-family:Inter,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:32px;max-width:680px;margin:0 auto;border-radius:12px;">
      <h1 style="font-family:Montserrat,sans-serif;color:#FF5E3A;margin:0 0 4px;font-size:24px;">OpenClaw Weekly Digest</h1>
      <p style="color:#a1a1aa;margin:0 0 24px;font-size:14px;">${fmtRange(data.period_start, data.period_end)} (vs prior 7 days)</p>
      <table style="width:100%;border-collapse:collapse;background:#18181b;border-radius:8px;padding:8px;">
        <tbody>
          ${headlineRow('New free signups', totals.signups)}
          ${headlineRow('Team trial requests', totals.team_requests)}
          ${headlineRow('Free → Premium conversions', totals.conversions)}
        </tbody>
      </table>
      ${data.top_campaign ? `<p style="margin:16px 0 0;font-size:14px;color:#d4d4d8;">🏆 Top-performing campaign: <strong style="color:#FF5E3A;">${escapeHtml(data.top_campaign)}</strong></p>` : ''}
      ${renderTable('Signups by source', data.signups)}
      ${renderTable('Team trial requests by source', data.team_requests)}
      ${renderTable('Free → Premium conversions by source', data.conversions)}
      <p style="margin:32px 0 0;font-size:13px;color:#71717a;">
        <a href="${adminUrl}" style="color:#FF5E3A;text-decoration:none;font-weight:600;">Open the live attribution panel →</a>
      </p>
      <p style="margin:24px 0 0;font-size:12px;color:#52525b;">Buckets shown as <code>(direct)</code> / <code>(none)</code> are visits with no UTM tag (typed URLs, untagged links). Pre–this-week signups are not back-attributed.</p>
    </div>`;
  }

  async function sendOpenClawWeeklyDigest() {
    try {
      const data = await buildWeeklyAttribution();
      const html = _renderAttributionDigestHtml(data);
      await resend.emails.send({
        from: 'ServeMaster Academy <kirk_adamson@servemasteracademy.ca>',
        to: KIRK_DIGEST_EMAIL,
        subject: `OpenClaw weekly digest — ${data.totals.signups.current} signups, ${data.totals.team_requests.current} team trial requests`,
        html,
      });
      await db.query(
        `INSERT INTO site_settings (key, value) VALUES ('openclaw_digest_last_sent_at', $1)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [new Date().toISOString()]
      );
      console.log('[OpenClaw digest] sent to', KIRK_DIGEST_EMAIL);
      return { sent: true };
    } catch (e) {
      console.error('[OpenClaw digest] send error:', e.message);
      throw e;
    }
  }

  async function sendKirkTrialDigest() {
    const rows = await db.query(`
      SELECT id, name, email, message, utm_source, utm_medium, utm_campaign, utm_content, attribution_referrer, created_at
      FROM contact_messages
      WHERE message LIKE '[TEAM TRIAL REQUEST]%'
        AND kirk_trial_digest_notified = FALSE
      ORDER BY created_at ASC
    `);
    if (!rows.rows.length) return { sent: 0 };

    const requests = rows.rows;
    const ids = requests.map(r => r.id);
    const dateLabel = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const rowsHtml = requests.map(r => {
      const receivedAt = new Date(r.created_at).toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' });
      const msgMatch = r.message.match(/\[TEAM TRIAL REQUEST\] Restaurant: ([^|]+?)(?:\s*\|\s*Staff:\s*(\S+))?$/);
      const restName = msgMatch ? msgMatch[1].trim() : '(unknown)';
      const staffCount = msgMatch && msgMatch[2] ? msgMatch[2].trim() : null;
      const utmParts = [];
      if (r.utm_source)   utmParts.push(`source: <strong>${escapeHtml(r.utm_source)}</strong>`);
      if (r.utm_medium)   utmParts.push(`medium: <strong>${escapeHtml(r.utm_medium)}</strong>`);
      if (r.utm_campaign) utmParts.push(`campaign: <strong>${escapeHtml(r.utm_campaign)}</strong>`);
      const attrib = utmParts.length ? utmParts.join(' · ') : '<em style="color:#71717a;">direct / untagged</em>';
      return `<tr style="border-bottom:1px solid #27272a;">
        <td style="padding:12px 8px;font-weight:600;">${escapeHtml(r.name)}</td>
        <td style="padding:12px 8px;"><a href="mailto:${escapeHtml(r.email)}" style="color:#FF5E3A;">${escapeHtml(r.email)}</a></td>
        <td style="padding:12px 8px;">${escapeHtml(restName)}</td>
        <td style="padding:12px 8px;text-align:center;">${staffCount ? escapeHtml(staffCount) : '—'}</td>
        <td style="padding:12px 8px;font-size:12px;color:#a1a1aa;">${escapeHtml(receivedAt)} ET</td>
        <td style="padding:12px 8px;font-size:12px;color:#a1a1aa;">${attrib}</td>
      </tr>`;
    }).join('');

    const subjectCount = requests.length === 1 ? '1 new team trial request' : `${requests.length} new team trial requests`;
    await resend.emails.send({
      from: 'ServeMaster Academy <kirk_adamson@servemasteracademy.ca>',
      to: 'kirk_adamson@servemasteracademy.ca',
      subject: `[Daily Digest] ${subjectCount} — ${dateLabel}`,
      html: `<div style="font-family:sans-serif;max-width:720px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:32px;border-radius:12px;">
        <h2 style="color:#FF5E3A;margin-top:0;">Team Trial Request Digest</h2>
        <p style="font-size:13px;color:#a1a1aa;margin:0 0 24px 0;">${dateLabel} &nbsp;·&nbsp; ${requests.length} request${requests.length === 1 ? '' : 's'} pending your action</p>
        <div style="overflow-x:auto;">
          <table style="font-size:14px;width:100%;border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:2px solid #3f3f46;color:#a1a1aa;text-align:left;">
                <th style="padding:8px 8px 12px;">Name</th>
                <th style="padding:8px 8px 12px;">Email</th>
                <th style="padding:8px 8px 12px;">Restaurant</th>
                <th style="padding:8px 8px 12px;text-align:center;">Staff</th>
                <th style="padding:8px 8px 12px;">Received</th>
                <th style="padding:8px 8px 12px;">Attribution</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <p style="margin-top:24px;font-size:13px;color:#71717a;line-height:1.6;">
          Click an email address above to open a new message, or hit Reply to reach the last requester.<br>
          Each requester has already received their "request received" confirmation.
        </p>
      </div>`
    });

    await db.query(
      `UPDATE contact_messages SET kirk_trial_digest_notified = TRUE WHERE id = ANY($1::int[])`,
      [ids]
    );
    console.log(`[Kirk trial digest] sent digest covering ${ids.length} request(s)`);
    return { sent: ids.length };
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

  // ── Affiliates ────────────────────────────────────────────────────────────────
  router.get('/api/admin/affiliates', adminMiddleware, async (req, res) => {
    try {
      const affiliates = await db.query(`
        SELECT i.*,
          COUNT(ic.id) FILTER (WHERE ic.status = 'pending') AS pending_count,
          COALESCE(SUM(ic.amount_cad + COALESCE(ic.activation_bonus,0)) FILTER (WHERE ic.status = 'pending'), 0) AS pending_payout,
          COUNT(ic.id) FILTER (WHERE ic.status = 'payout_ready') AS payout_ready_count,
          COALESCE(SUM(ic.amount_cad + COALESCE(ic.activation_bonus,0)) FILTER (WHERE ic.status = 'payout_ready'), 0) AS payout_ready_amount,
          COUNT(ic.id) FILTER (WHERE ic.status = 'blocked') AS blocked_count,
          COALESCE(SUM(ic.amount_cad) FILTER (WHERE ic.status = 'paid'), 0) AS total_paid,
          COUNT(ic.id) FILTER (WHERE ic.commission_type = 'sale') AS total_conversions,
          COALESCE(SUM(ic.amount_cad) FILTER (WHERE ic.commission_type = 'welcome_bonus' AND ic.status NOT IN ('blocked','reversed')), 0) AS welcome_bonus_total,
          (i.welcome_bonus_granted_at IS NOT NULL) AS welcome_bonus_granted
        FROM influencers i
        LEFT JOIN influencer_commissions ic ON ic.influencer_id = i.id
        GROUP BY i.id
        ORDER BY i.created_at DESC
      `);
      const commissions = await db.query(`
        SELECT ic.*, i.name AS influencer_name, i.handle AS influencer_handle
        FROM influencer_commissions ic
        JOIN influencers i ON i.id = ic.influencer_id
        ORDER BY ic.created_at DESC
      `);
      res.json({ affiliates: affiliates.rows, commissions: commissions.rows });
    } catch (e) { console.error('Admin affiliates error:', e.message); res.status(500).json({ error: 'Server error' }); }
  });

  router.post('/api/admin/affiliates/:id/approve', adminMiddleware, async (req, res) => {
    const affId = parseInt(req.params.id);
    if (!affId) return res.status(400).json({ error: 'Invalid id' });
    try {
      const affRes = await db.query('SELECT * FROM influencers WHERE id = $1', [affId]);
      if (!affRes.rows.length) return res.status(404).json({ error: 'Affiliate not found' });
      const aff = affRes.rows[0];
      if (aff.status === 'approved') return res.status(409).json({ error: 'Already approved' });
      const slug = aff.handle.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
      const suffix = Math.random().toString(36).slice(2, 7);
      const refCode = `${slug}-${suffix}`;
      await db.query(`UPDATE influencers SET status = 'approved', ref_code = $1, approved_at = NOW() WHERE id = $2`, [refCode, affId]);
      const link = `https://servemasteracademy.ca/r/${refCode}`;
      const safeName = escapeHtml(aff.name);
      resend.emails.send({
        from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
        to: aff.email,
        subject: 'Welcome to the ServeMaster Partners Program!',
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${safeName},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">I've reviewed your application and I'm pleased to welcome you to the <strong style="color:#FF5E3A;">ServeMaster Partners Program</strong>.</p><p style="font-size:16px;line-height:1.7;margin-bottom:8px;"><strong>Your unique tracking link:</strong></p><div style="background:#1a1a1a;border:2px solid #FF5E3A;border-radius:12px;padding:20px;margin:16px 0;word-break:break-all;"><p style="font-size:14px;color:#FF5E3A;margin:0;font-family:monospace;">${link}</p></div><p style="font-size:15px;line-height:1.7;color:#a3a3a3;margin-bottom:8px;"><strong style="color:#f5f5f5;">Your commission structure:</strong></p><ul style="color:#a3a3a3;font-size:14px;line-height:2;padding-left:20px;"><li>Individual Premium Monthly ($19/mo) — <strong style="color:#f5f5f5;">25% = ~$4.75 CAD</strong></li><li>Individual Premium Annual ($149/yr) — <strong style="color:#f5f5f5;">25% = ~$37.25 CAD</strong></li><li>Starter Team ($99/mo) — <strong style="color:#f5f5f5;">30% = ~$29.70 CAD + $75 activation bonus</strong></li><li>Pro Team ($199/mo) — <strong style="color:#f5f5f5;">30% = ~$59.70 CAD + $75 activation bonus</strong></li></ul><div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:16px;margin:20px 0;"><p style="font-size:14px;color:#f5f5f5;font-weight:700;margin:0 0 6px;">$100 Welcome Bonus</p><p style="font-size:13px;color:#a3a3a3;margin:0;">You'll receive a $100 CAD welcome bonus after your first qualified sale on any plan.</p></div><p style="font-size:16px;line-height:1.7;margin-top:32px;color:#a3a3a3;"><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy</p></div>`
      }).catch(e => console.error('Affiliate approve email error:', e.message));
      res.json({ success: true, ref_code: refCode, link });
    } catch (e) { console.error('Affiliate approve error:', e.message); res.status(500).json({ error: 'Server error' }); }
  });

  router.post('/api/admin/affiliates/:id/reject', adminMiddleware, async (req, res) => {
    const affId = parseInt(req.params.id);
    if (!affId) return res.status(400).json({ error: 'Invalid id' });
    try {
      const affRes = await db.query('SELECT * FROM influencers WHERE id = $1', [affId]);
      if (!affRes.rows.length) return res.status(404).json({ error: 'Affiliate not found' });
      const aff = affRes.rows[0];
      await db.query(`UPDATE influencers SET status = 'rejected' WHERE id = $1`, [affId]);
      resend.emails.send({
        from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
        to: aff.email,
        subject: 'Your ServeMaster Academy affiliate application',
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(aff.name)},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Thank you for applying to our affiliate program. I reviewed your application personally — unfortunately, we aren't able to move forward at this time.</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">We keep a small, curated group of partners, and the fit needs to be right for both sides. I encourage you to reach out again in the future as your audience grows or evolves.</p><p style="font-size:16px;line-height:1.7;margin-top:32px;color:#a3a3a3;"><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy</p></div>`
      }).catch(e => console.error('Affiliate reject email error:', e.message));
      res.json({ success: true });
    } catch (e) { console.error('Affiliate reject error:', e.message); res.status(500).json({ error: 'Server error' }); }
  });

  router.post('/api/admin/affiliates/commissions/:id/mark-paid', adminMiddleware, express.json(), async (req, res) => {
    const commId = parseInt(req.params.id);
    const { payment_ref, payout_method, payout_amount, override_pending } = req.body;
    if (!commId || !payment_ref) return res.status(400).json({ error: 'Commission ID and payment reference required' });
    try {
      const check = await db.query('SELECT status FROM influencer_commissions WHERE id = $1', [commId]);
      if (!check.rows.length) return res.status(404).json({ error: 'Commission not found' });
      const currentStatus = check.rows[0].status;
      if (currentStatus === 'paid') return res.status(409).json({ error: 'Already paid' });
      if (currentStatus === 'blocked') return res.status(409).json({ error: 'Commission is blocked — unblock before paying' });
      if (currentStatus === 'pending' && !override_pending) {
        return res.status(422).json({ error: '14-day hold not cleared. Pass override_pending:true to force.', status: currentStatus });
      }
      const commRes = await db.query(
        `UPDATE influencer_commissions SET status = 'paid', payment_ref = $1, paid_at = NOW() WHERE id = $2 RETURNING *`,
        [payment_ref.trim(), commId]
      );
      const comm = commRes.rows[0];
      const infData = await db.query(`SELECT name, email FROM influencers WHERE id = $1`, [comm.influencer_id]);
      if (infData.rows.length) {
        const totalPayout = parseFloat(comm.amount_cad) + parseFloat(comm.activation_bonus || 0);
        resend.emails.send({
          from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
          to: infData.rows[0].email,
          subject: `Payment confirmed — $${totalPayout.toFixed(2)} CAD`,
          html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(infData.rows[0].name)},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Your commission payment of <strong style="color:#FF5E3A;">$${totalPayout.toFixed(2)} CAD</strong> has been processed.</p><div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:16px;margin:16px 0;font-size:13px;color:#a3a3a3;"><p style="margin:0 0 6px;"><strong style="color:#f5f5f5;">Payment reference:</strong> ${escapeHtml(payment_ref)}</p><p style="margin:0;"><strong style="color:#f5f5f5;">Plan converted:</strong> ${escapeHtml(comm.plan_type.replace(/_/g,' '))}</p></div><p style="font-size:15px;color:#a3a3a3;line-height:1.7;">Thank you for promoting ServeMaster Academy. Your next monthly summary will arrive on the 1st of next month.</p><p style="font-size:16px;line-height:1.7;margin-top:32px;color:#a3a3a3;"><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy</p></div>`
        }).catch(e => console.error('Mark paid email error:', e.message));
      }
      res.json({ success: true });
    } catch (e) { console.error('Mark paid error:', e.message); res.status(500).json({ error: 'Server error' }); }
  });

  router.post('/api/admin/affiliates/commissions/:id/block', adminMiddleware, express.json(), async (req, res) => {
    const commId = parseInt(req.params.id);
    const { reason } = req.body;
    if (!commId) return res.status(400).json({ error: 'Invalid commission ID' });
    try {
      const result = await db.query(
        `UPDATE influencer_commissions SET status = 'blocked', blocked_reason = $1 WHERE id = $2 AND status NOT IN ('paid','reversed') RETURNING id`,
        [(reason || 'admin_blocked').trim(), commId]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Commission not found or already paid/reversed' });
      res.json({ success: true });
    } catch (e) { console.error('Block commission error:', e.message); res.status(500).json({ error: 'Server error' }); }
  });

  router.post('/api/admin/affiliates/commissions/:id/reverse', adminMiddleware, express.json(), async (req, res) => {
    const commId = parseInt(req.params.id);
    const { reason } = req.body;
    if (!commId) return res.status(400).json({ error: 'Invalid commission ID' });
    try {
      const result = await db.query(
        `UPDATE influencer_commissions SET status = 'reversed', blocked_reason = $1 WHERE id = $2 AND status = 'paid' RETURNING id`,
        [(reason || 'admin_reversed').trim(), commId]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Commission not found or not in paid state' });
      res.json({ success: true });
    } catch (e) { console.error('Reverse commission error:', e.message); res.status(500).json({ error: 'Server error' }); }
  });

  router.get('/api/admin/affiliates/payout-summary', adminMiddleware, async (req, res) => {
    const PAYOUT_THRESHOLD_CAD = 50;
    try {
      const rows = await db.query(`
        SELECT i.id, i.name, i.email, i.handle, i.tier, i.pref_payout_method, i.country_code, i.ref_code,
               i.stripe_connect_id, i.stripe_onboard_status, i.stripe_payouts_enabled,
               i.welcome_bonus_granted_at,
          COALESCE(SUM(ic.amount_cad + COALESCE(ic.activation_bonus,0)) FILTER (WHERE ic.status = 'payout_ready'), 0) AS payout_ready_total,
          COALESCE(SUM(ic.amount_cad) FILTER (WHERE ic.status = 'payout_ready' AND ic.commission_type = 'sale'), 0) AS sale_ready_total,
          COALESCE(SUM(ic.activation_bonus) FILTER (WHERE ic.status = 'payout_ready' AND ic.commission_type = 'sale'), 0) AS activation_bonus_ready,
          COALESCE(SUM(ic.amount_cad) FILTER (WHERE ic.status = 'payout_ready' AND ic.commission_type = 'welcome_bonus'), 0) AS welcome_bonus_ready,
          COUNT(ic.id) FILTER (WHERE ic.status = 'payout_ready' AND ic.commission_type = 'sale') AS sale_ready_count,
          COUNT(ic.id) FILTER (WHERE ic.status = 'payout_ready' AND ic.commission_type = 'welcome_bonus') AS welcome_bonus_ready_count,
          MIN(ic.eligible_at) FILTER (WHERE ic.status = 'payout_ready') AS earliest_eligible,
          COALESCE(SUM(ic.amount_cad) FILTER (WHERE ic.status = 'paid'), 0) AS lifetime_paid
        FROM influencers i
        JOIN influencer_commissions ic ON ic.influencer_id = i.id
        WHERE i.status = 'approved'
        GROUP BY i.id
        HAVING COALESCE(SUM(ic.amount_cad + COALESCE(ic.activation_bonus,0)) FILTER (WHERE ic.status = 'payout_ready'), 0) > 0
        ORDER BY payout_ready_total DESC
      `);
      const summary = rows.rows.map(r => ({
        ...r,
        payout_ready_total:       parseFloat(r.payout_ready_total),
        sale_ready_total:         parseFloat(r.sale_ready_total),
        activation_bonus_ready:   parseFloat(r.activation_bonus_ready),
        welcome_bonus_ready:      parseFloat(r.welcome_bonus_ready),
        lifetime_paid:            parseFloat(r.lifetime_paid),
        meets_threshold:          parseFloat(r.payout_ready_total) >= PAYOUT_THRESHOLD_CAD,
        payout_action: !r.stripe_connect_id ? 'initiate_onboarding'
          : r.stripe_onboard_status !== 'complete' ? 'await_onboarding'
          : !r.stripe_payouts_enabled ? 'sync_status'
          : parseFloat(r.payout_ready_total) < PAYOUT_THRESHOLD_CAD ? 'below_threshold'
          : 'ready_to_pay'
      }));
      res.json({ threshold_cad: PAYOUT_THRESHOLD_CAD, affiliates: summary, generated_at: new Date().toISOString() });
    } catch (e) { console.error('Payout summary error:', e.message); res.status(500).json({ error: 'Server error' }); }
  });

  // ── Stripe Connect ────────────────────────────────────────────────────────────
  router.post('/api/admin/affiliates/:id/stripe-connect/initiate', adminMiddleware, async (req, res) => {
    const affId = parseInt(req.params.id);
    if (!affId) return res.status(400).json({ error: 'Invalid affiliate ID' });
    try {
      const affRes = await db.query('SELECT * FROM influencers WHERE id = $1', [affId]);
      if (!affRes.rows.length) return res.status(404).json({ error: 'Affiliate not found' });
      const aff = affRes.rows[0];
      if (aff.status !== 'approved') return res.status(422).json({ error: 'Affiliate must be approved before initiating payout onboarding' });

      const stripe = await getUncachableStripeClient();
      const country = (aff.country_code || 'CA').toUpperCase();

      let connectId = aff.stripe_connect_id;
      if (!connectId) {
        const account = await stripe.accounts.create({
          type: 'express',
          country,
          email: aff.email,
          capabilities: { transfers: { requested: true } },
          business_type: 'individual',
          metadata: { influencer_id: String(affId), ref_code: aff.ref_code || '' }
        });
        connectId = account.id;
        await db.query(
          `UPDATE influencers SET stripe_connect_id = $1, stripe_onboard_status = 'not_started', stripe_payouts_enabled = FALSE WHERE id = $2`,
          [connectId, affId]
        );
      }

      const link = await stripe.accountLinks.create({
        account: connectId,
        refresh_url: `${APP_URL}/api/affiliate/onboarding-refresh/${aff.ref_code}`,
        return_url: `${APP_URL}/partner-onboarding-complete`,
        type: 'account_onboarding'
      });

      await db.query(`UPDATE influencers SET stripe_onboard_status = 'link_sent' WHERE id = $1`, [affId]);

      const safeName = escapeHtml(aff.name);
      resend.emails.send({
        from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
        to: aff.email,
        subject: 'Action required: Set up your payout account — ServeMaster Academy',
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
          <img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;">
          <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${safeName},</p>
          <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">You have commissions ready for payout. To receive your payment, please complete a quick one-time setup to add your bank details securely.</p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${link.url}" style="background:#FF5E3A;color:#fff;font-weight:700;font-size:16px;padding:16px 32px;border-radius:50px;text-decoration:none;display:inline-block;">Set Up Payout Account →</a>
          </div>
          <p style="font-size:13px;color:#a3a3a3;line-height:1.7;">This link expires in 24 hours. If it expires, reply to this email and I'll send a new one.</p>
          <p style="font-size:13px;color:#6b7280;margin-top:8px;">Your commission earnings and tracking link are not affected by this setup.</p>
          <p style="font-size:16px;line-height:1.7;margin-top:32px;color:#a3a3a3;"><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy</p>
        </div>`
      }).catch(e => console.error('Connect initiate email error:', e.message));

      res.json({ success: true, stripe_connect_id: connectId, onboard_url: link.url, expires_at: new Date(link.expires_at * 1000).toISOString() });
    } catch (e) { console.error('Stripe Connect initiate error:', e.message); res.status(500).json({ error: e.message }); }
  });

  router.get('/api/admin/affiliates/:id/stripe-connect/link', adminMiddleware, async (req, res) => {
    const affId = parseInt(req.params.id);
    if (!affId) return res.status(400).json({ error: 'Invalid affiliate ID' });
    try {
      const affRes = await db.query('SELECT stripe_connect_id, ref_code FROM influencers WHERE id = $1', [affId]);
      if (!affRes.rows.length) return res.status(404).json({ error: 'Affiliate not found' });
      const { stripe_connect_id, ref_code } = affRes.rows[0];
      if (!stripe_connect_id) return res.status(422).json({ error: 'No Stripe Connect account yet — run initiate first' });
      const stripe = await getUncachableStripeClient();
      const link = await stripe.accountLinks.create({
        account: stripe_connect_id,
        refresh_url: `${APP_URL}/api/affiliate/onboarding-refresh/${ref_code}`,
        return_url: `${APP_URL}/partner-onboarding-complete`,
        type: 'account_onboarding'
      });
      res.json({ onboard_url: link.url, expires_at: new Date(link.expires_at * 1000).toISOString() });
    } catch (e) { console.error('Connect link error:', e.message); res.status(500).json({ error: e.message }); }
  });

  router.post('/api/admin/affiliates/:id/stripe-connect/sync', adminMiddleware, async (req, res) => {
    const affId = parseInt(req.params.id);
    if (!affId) return res.status(400).json({ error: 'Invalid affiliate ID' });
    try {
      const affRes = await db.query('SELECT stripe_connect_id FROM influencers WHERE id = $1', [affId]);
      if (!affRes.rows.length) return res.status(404).json({ error: 'Affiliate not found' });
      const { stripe_connect_id } = affRes.rows[0];
      if (!stripe_connect_id) return res.status(422).json({ error: 'No Stripe Connect account yet' });
      const stripe = await getUncachableStripeClient();
      const acct = await stripe.accounts.retrieve(stripe_connect_id);
      const payoutsEnabled = acct.payouts_enabled === true;
      const onboardStatus = acct.details_submitted ? (payoutsEnabled ? 'complete' : 'restricted') : 'link_sent';
      await db.query(
        `UPDATE influencers SET stripe_payouts_enabled = $1, stripe_onboard_status = $2 WHERE id = $3`,
        [payoutsEnabled, onboardStatus, affId]
      );
      res.json({ success: true, stripe_connect_id, payouts_enabled: payoutsEnabled, onboard_status: onboardStatus, details_submitted: acct.details_submitted });
    } catch (e) { console.error('Connect sync error:', e.message); res.status(500).json({ error: e.message }); }
  });

  router.post('/api/admin/affiliates/:id/payout', adminMiddleware, express.json(), async (req, res) => {
    const PAYOUT_THRESHOLD_CAD = 50;
    const affId = parseInt(req.params.id);
    if (!affId) return res.status(400).json({ error: 'Invalid affiliate ID' });
    try {
      const affRes = await db.query(
        'SELECT id, name, email, stripe_connect_id, stripe_payouts_enabled, stripe_onboard_status FROM influencers WHERE id = $1',
        [affId]
      );
      if (!affRes.rows.length) return res.status(404).json({ error: 'Affiliate not found' });
      const aff = affRes.rows[0];
      if (!aff.stripe_connect_id) return res.status(422).json({ error: 'Affiliate has no Stripe Connect account — run initiate first' });
      if (!aff.stripe_payouts_enabled) return res.status(422).json({ error: `Affiliate onboarding is not complete (status: ${aff.stripe_onboard_status})` });

      const commRes = await db.query(
        `SELECT id, commission_type, plan_type, amount_cad, activation_bonus FROM influencer_commissions WHERE influencer_id = $1 AND status = 'payout_ready'`,
        [affId]
      );
      if (!commRes.rows.length) return res.status(422).json({ error: 'No payout_ready commissions for this affiliate' });

      const saleRows    = commRes.rows.filter(r => r.commission_type === 'sale');
      const welcomeRows = commRes.rows.filter(r => r.commission_type === 'welcome_bonus');
      const saleTotal    = saleRows.reduce((s, r) => s + parseFloat(r.amount_cad) + parseFloat(r.activation_bonus || 0), 0);
      const welcomeTotal = welcomeRows.reduce((s, r) => s + parseFloat(r.amount_cad), 0);
      const totalCad = saleTotal + welcomeTotal;
      if (totalCad < PAYOUT_THRESHOLD_CAD) {
        return res.status(422).json({ error: `Below $${PAYOUT_THRESHOLD_CAD} CAD minimum threshold (current: $${totalCad.toFixed(2)} CAD)` });
      }

      const amountCents = Math.round(totalCad * 100);
      const now = new Date();
      const transferGroup = `payout-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const commissionIds = commRes.rows.map(r => r.id);

      const stripe = await getUncachableStripeClient();
      const transfer = await stripe.transfers.create({
        amount: amountCents,
        currency: 'cad',
        destination: aff.stripe_connect_id,
        transfer_group: transferGroup,
        description: `ServeMaster Academy partner payout — ${saleRows.length} sale(s)${welcomeRows.length ? ` + $${WELCOME_BONUS_CAD} welcome bonus` : ''} — ${transferGroup}`,
        metadata: {
          influencer_id:       String(affId),
          sale_count:          String(saleRows.length),
          welcome_bonus_count: String(welcomeRows.length),
          commission_ids:      commissionIds.join(',')
        }
      });

      await db.query(
        `UPDATE influencer_commissions SET status = 'paid', payment_ref = $1, paid_at = NOW() WHERE id = ANY($2)`,
        [transfer.id, commissionIds]
      );

      const activationBonusTotal = saleRows.reduce((s, r) => s + parseFloat(r.activation_bonus || 0), 0);
      const saleCommissionOnly   = saleRows.reduce((s, r) => s + parseFloat(r.amount_cad), 0);
      const breakdownLines = [
        saleRows.length > 0
          ? `<tr><td style="padding:6px 0;color:#a3a3a3;">Sale commissions (${saleRows.length})</td><td style="padding:6px 0;color:#f5f5f5;text-align:right;">$${saleCommissionOnly.toFixed(2)} CAD</td></tr>`
          : '',
        activationBonusTotal > 0
          ? `<tr><td style="padding:6px 0;color:#a3a3a3;">Team activation bonuses</td><td style="padding:6px 0;color:#f5f5f5;text-align:right;">$${activationBonusTotal.toFixed(2)} CAD</td></tr>`
          : '',
        welcomeRows.length > 0
          ? `<tr><td style="padding:6px 0;color:#a3a3a3;">First-sale welcome bonus</td><td style="padding:6px 0;color:#FF5E3A;text-align:right;font-weight:700;">$${welcomeTotal.toFixed(2)} CAD</td></tr>`
          : '',
      ].filter(Boolean).join('');

      resend.emails.send({
        from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
        to: aff.email,
        subject: `Payout sent — $${totalCad.toFixed(2)} CAD`,
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
          <img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;">
          <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(aff.name)},</p>
          <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Your partner payout of <strong style="color:#FF5E3A;">$${totalCad.toFixed(2)} CAD</strong> has been sent to your account.</p>
          <div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:16px;margin:16px 0;font-size:13px;">
            <table style="width:100%;border-collapse:collapse;">
              ${breakdownLines}
              <tr style="border-top:1px solid #333;"><td style="padding:10px 0 0;color:#f5f5f5;font-weight:700;">Total</td><td style="padding:10px 0 0;color:#FF5E3A;font-weight:700;text-align:right;font-size:15px;">$${totalCad.toFixed(2)} CAD</td></tr>
            </table>
          </div>
          <div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:16px;margin:16px 0;font-size:13px;color:#a3a3a3;">
            <p style="margin:0 0 6px;"><strong style="color:#f5f5f5;">Transfer reference:</strong> ${transfer.id}</p>
            <p style="margin:0;"><strong style="color:#f5f5f5;">Period:</strong> ${transferGroup}</p>
          </div>
          <p style="font-size:14px;color:#a3a3a3;line-height:1.7;">Funds typically arrive in your account within 1–3 business days depending on your bank. Thank you for promoting ServeMaster Academy.</p>
          <p style="font-size:16px;line-height:1.7;margin-top:32px;color:#a3a3a3;"><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy</p>
        </div>`
      }).catch(e => console.error('Payout email error:', e.message));

      res.json({
        success: true,
        transfer_id:    transfer.id,
        transfer_group: transferGroup,
        breakdown: {
          sale_commissions:   saleCommissionOnly.toFixed(2),
          activation_bonuses: activationBonusTotal.toFixed(2),
          welcome_bonus:      welcomeTotal.toFixed(2),
          total:              totalCad.toFixed(2)
        },
        commissions_paid:        commissionIds.length,
        sale_count:              saleRows.length,
        welcome_bonus_included:  welcomeRows.length > 0
      });
    } catch (e) { console.error('Payout transfer error:', e.message); res.status(500).json({ error: e.message }); }
  });

  router.post('/api/admin/affiliates/:id/update-payout-method', adminMiddleware, express.json(), async (req, res) => {
    const affId = parseInt(req.params.id);
    const { pref_payout_method } = req.body;
    if (!affId) return res.status(400).json({ error: 'Invalid id' });
    try {
      await db.query(`UPDATE influencers SET pref_payout_method = $1 WHERE id = $2`, [(pref_payout_method || '').trim() || null, affId]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
  });

  router.get('/api/admin/affiliates/export-csv', adminMiddleware, async (req, res) => {
    try {
      const { month } = req.query;
      let whereClause = '';
      const params = [];
      if (month) {
        const [yr, mo] = month.split('-').map(Number);
        if (yr && mo) {
          const start = new Date(yr, mo - 1, 1);
          const end   = new Date(yr, mo, 1);
          whereClause = `WHERE ic.created_at >= $1 AND ic.created_at < $2`;
          params.push(start, end);
        }
      }
      const rows = await db.query(`
        SELECT ic.id, i.name AS partner_name, i.email AS partner_email, i.handle, i.tier,
               ic.commission_type, ic.plan_type, ic.amount_cad, ic.commission_rate, ic.activation_bonus,
               ic.status, ic.payment_ref, ic.paid_at, ic.created_at
        FROM influencer_commissions ic
        JOIN influencers i ON i.id = ic.influencer_id
        ${whereClause}
        ORDER BY ic.created_at DESC
      `, params);
      const cols = ['id','partner_name','partner_email','handle','tier','commission_type','plan_type','amount_cad','commission_rate','activation_bonus','status','payment_ref','paid_at','created_at'];
      const csv = [cols.join(','), ...rows.rows.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="affiliates-${month || 'all'}.csv"`);
      res.send(csv);
    } catch (e) { console.error('Affiliate export error:', e.message); res.status(500).json({ error: 'Server error' }); }
  });

  router.post('/api/admin/affiliates/generate-monthly-summaries', adminMiddleware, async (req, res) => {
    try {
      const now = new Date();
      const prevMonth      = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthStart = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1);
      const prevMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 1);
      const approved = await db.query(`SELECT id, name, email, ref_code, tier FROM influencers WHERE status = 'approved'`);
      const summaries = [];
      for (const inf of approved.rows) {
        const allTime = await db.query(
          `SELECT COUNT(*) FILTER (WHERE commission_type = 'sale') as cnt,
                  COALESCE(SUM(amount_cad),0) as total,
                  COALESCE(SUM(amount_cad) FILTER (WHERE commission_type = 'welcome_bonus' AND status NOT IN ('blocked','reversed')),0) as welcome_bonus_total
           FROM influencer_commissions WHERE influencer_id = $1`, [inf.id]
        );
        if (parseInt(allTime.rows[0].cnt) === 0) continue;
        const thisMonth = await db.query(
          `SELECT COUNT(*) FILTER (WHERE commission_type = 'sale') as cnt,
                  COALESCE(SUM(amount_cad) FILTER (WHERE commission_type = 'sale'),0) as earned,
                  COALESCE(SUM(activation_bonus),0) as bonuses,
                  COALESCE(SUM(amount_cad) FILTER (WHERE commission_type = 'welcome_bonus'),0) as welcome_bonus
           FROM influencer_commissions WHERE influencer_id = $1 AND created_at >= $2 AND created_at < $3`,
          [inf.id, prevMonthStart, prevMonthEnd]
        );
        const pending = await db.query(
          `SELECT COALESCE(SUM(amount_cad + activation_bonus),0) as total FROM influencer_commissions WHERE influencer_id = $1 AND status IN ('pending','payout_ready')`, [inf.id]
        );
        summaries.push({
          id: inf.id, name: inf.name, email: inf.email, tier: inf.tier,
          link: `https://servemasteracademy.ca/r/${inf.ref_code}`,
          conversions: parseInt(thisMonth.rows[0].cnt),
          earned:           parseFloat(thisMonth.rows[0].earned).toFixed(2),
          bonuses:          parseFloat(thisMonth.rows[0].bonuses).toFixed(2),
          welcome_bonus:    parseFloat(thisMonth.rows[0].welcome_bonus).toFixed(2),
          pending:          parseFloat(pending.rows[0].total).toFixed(2),
          allTime:          parseFloat(allTime.rows[0].total).toFixed(2),
          allTimeWelcomeBonus: parseFloat(allTime.rows[0].welcome_bonus_total).toFixed(2),
        });
      }
      res.json({ month: prevMonth.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' }), summaries });
    } catch (e) { console.error('Generate summaries error:', e.message); res.status(500).json({ error: 'Server error' }); }
  });

  return { router, sendOpenClawWeeklyDigest, sendKirkTrialDigest };
};
