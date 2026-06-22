'use strict';
const crypto = require('crypto');

/**
 * createEmailHelpers({ db, resend })
 *
 * Returns shared email utility functions used across route modules:
 *   escapeHtml, getTenantBrandingForEmail,
 *   sendTrialDripEmails, generateUnsubToken, getOrCreateUnsubToken,
 *   emailFooter, sendDripEmailIfDue, sendWeeklyManagerDigests
 */
module.exports = function createEmailHelpers({ db, resend }) {

  // ── HTML escaping ─────────────────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Returns white-label branding for transactional email sending.
   * Falls back to ServeMaster defaults if the user has no active tenant.
   */
  async function getTenantBrandingForEmail(userId) {
    const defaults = {
      brandName: 'ServeMaster Academy',
      logoUrl: 'https://servemasteracademy.ca/logo.png',
      fromLine: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
      poweredBy: '',
    };
    if (!userId) return defaults;
    try {
      const r = await db.query(
        `SELECT r.wl_brand_name, r.wl_logo_url, r.wl_is_active, r.name
         FROM restaurants r
         JOIN users u ON u.restaurant_id = r.id
         WHERE u.id = $1`,
        [userId]
      );
      const row = r.rows[0];
      if (!row || !row.wl_is_active) return defaults;
      const brand = row.wl_brand_name || row.name;
      return {
        brandName: brand,
        logoUrl: row.wl_logo_url || defaults.logoUrl,
        fromLine: `${brand} Training <kirk_adamson@servemasteracademy.ca>`,
        poweredBy: `<p style="font-size:11px;color:#555;margin-top:16px;text-align:center;">Powered by <a href="https://servemasteracademy.ca" style="color:#888;text-decoration:none;">ServeMaster Academy</a></p>`,
      };
    } catch (_) { return defaults; }
  }

  // ── Unsubscribe helpers ───────────────────────────────────────────────────
  function generateUnsubToken() { return crypto.randomBytes(32).toString('hex'); }

  async function getOrCreateUnsubToken(userId) {
    const r = await db.query('SELECT token FROM unsubscribe_tokens WHERE user_id = $1', [userId]);
    if (r.rows.length) return r.rows[0].token;
    const token = generateUnsubToken();
    await db.query('INSERT INTO unsubscribe_tokens (user_id, token) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET token = EXCLUDED.token', [userId, token]);
    return token;
  }

  function emailFooter(unsubUrl) {
    return `<hr style="border:none;border-top:1px solid #333;margin:32px 0;"><p style="font-size:11px;color:#555;line-height:1.6;text-align:center;">ServeMaster Academy · <a href="https://servemasteracademy.ca" style="color:#555;">servemasteracademy.ca</a> · <a href="${unsubUrl}" style="color:#555;">Unsubscribe</a></p>`;
  }

  // ── Trial drip emails (fired on login/Google callback) ───────────────────
  async function sendTrialDripEmails(user) {
    if (!user.trial_ends_at || user.subscription_status === 'active') return;
    const isUnsub = await db.query('SELECT is_unsubscribed FROM users WHERE id = $1', [user.id]).then(r => r.rows[0]?.is_unsubscribed).catch(() => false);
    if (isUnsub) return;
    const daysLeft = Math.max(0, Math.ceil((new Date(user.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)));
    const safeName = escapeHtml(user.name);
    const unsubToken = await getOrCreateUnsubToken(user.id).catch(() => '');
    const unsubUrl = `https://servemasteracademy.ca/unsubscribe?token=${unsubToken}`;
    const foot = emailFooter(unsubUrl);
    const sig = `<p style="font-size:15px;line-height:1.7;color:#a3a3a3;"><strong style="color:#f5f5f5;">Kirk</strong><br><a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#d4af37;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a></p>`;
    const wrap = body => `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;">${body}${sig}${foot}</div>`;
    if (daysLeft <= 4 && daysLeft > 0 && !user.day10_email_sent) {
      db.query('UPDATE users SET day7_email_sent = TRUE, day10_email_sent = TRUE WHERE id = $1', [user.id]).catch(() => {});
      resend.emails.send({ from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>', to: user.email, subject: 'Your trial ends in 4 days — save 20% today',
        html: wrap(`<p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${safeName},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Your 14-day free trial ends in just 4 days.</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">If you're enjoying the training and want to keep access to all 30 modules, the AI role-play, and the manager dashboard, now is a great time to upgrade.</p><p style="font-size:16px;line-height:1.7;margin-bottom:32px;">Use code <strong style="color:#d4af37;font-size:18px;letter-spacing:1px;">LAUNCH20</strong> for 20% off your first month.</p><p style="margin-bottom:32px;"><a href="https://servemasteracademy.ca/pricing" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Upgrade Now</a></p>`)
      }).catch(err => console.error('Day 10 email error:', err.message));
    } else if (daysLeft <= 7 && daysLeft > 0 && !user.day7_email_sent) {
      db.query('UPDATE users SET day7_email_sent = TRUE WHERE id = $1', [user.id]).catch(() => {});
      resend.emails.send({ from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>', to: user.email, subject: "You're halfway through your trial — here's what to try next",
        html: wrap(`<p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${safeName},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">You're now halfway through your 14-day trial.</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Many users tell me that by Day 7 they already feel more confident handling wine service and special occasions.</p><p style="font-size:16px;line-height:1.7;margin-bottom:32px;">If you haven't tried the Voice Practice yet, I highly recommend it — it's one of the features our early restaurant teams love most.</p><p style="margin-bottom:32px;"><a href="https://servemasteracademy.ca/app" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Continue Training</a></p>`)
      }).catch(err => console.error('Day 7 email error:', err.message));
    }
    if (daysLeft <= 2 && daysLeft > 0 && !user.day13_email_sent) {
      db.query('UPDATE users SET day13_email_sent = TRUE WHERE id = $1', [user.id]).catch(() => {});
      resend.emails.send({ from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>', to: user.email, subject: 'Your trial ends very soon — keep your access',
        html: wrap(`<p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${safeName},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Your free trial ends very soon.</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">If you've found value in the training, I'd love for you to continue the journey with a full membership.</p><p style="font-size:16px;line-height:1.7;margin-bottom:32px;">Use code <strong style="color:#d4af37;font-size:18px;letter-spacing:1px;">LAUNCH20</strong> for 20% off your first month or year.</p><p style="margin-bottom:32px;"><a href="https://servemasteracademy.ca/pricing" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Keep Access →</a></p>`)
      }).catch(err => console.error('Day 13 email error:', err.message));
    }
    if (daysLeft === 0 && !user.trial_expired_email_sent) {
      db.query('UPDATE users SET trial_expired_email_sent = TRUE WHERE id = $1', [user.id]).catch(() => {});
      resend.emails.send({ from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>', to: user.email, subject: 'Your trial has ended — 20% off for the next 7 days',
        html: wrap(`<p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${safeName},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Your 14-day free trial has ended.</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">I hope you had a chance to experience what ServeMaster Academy is all about — the fine-dining standards, the voice practice, the scenario simulations.</p><p style="font-size:16px;line-height:1.7;margin-bottom:32px;">If you're ready to continue, use code <strong style="color:#d4af37;font-size:18px;letter-spacing:1px;">LAUNCH20</strong> for 20% off. This offer is valid for 7 days.</p><p style="margin-bottom:32px;"><a href="https://servemasteracademy.ca/pricing" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Rejoin ServeMaster →</a></p>`)
      }).catch(err => console.error('Expired email error:', err.message));
    }
  }

  // ── Email drip sequence (post-signup nurture) ─────────────────────────────
  async function sendDripEmailIfDue(userId, userEmail, userName) {
    try {
      const drip = await db.query('SELECT day_sent FROM email_drip_log WHERE user_id = $1', [userId]);
      const sentDays = new Set(drip.rows.map(r => r.day_sent));
      const userRes = await db.query('SELECT created_at, is_unsubscribed FROM users WHERE id = $1', [userId]);
      if (!userRes.rows.length || userRes.rows[0].is_unsubscribed) return;
      const signupDate = new Date(userRes.rows[0].created_at);
      const daysSinceSignup = Math.floor((Date.now() - signupDate) / 86400000);
      const unsubToken = await getOrCreateUnsubToken(userId);
      const unsubUrl = `https://servemasteracademy.ca/unsubscribe?token=${unsubToken}`;
      const footer = emailFooter(unsubUrl);
      const wrap = (body) => `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;">${body}${footer}</div>`;
      const cta = (label, href) => `<p style="margin-bottom:32px;"><a href="${href}" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">${label}</a></p>`;
      const sig = `<p style="font-size:14px;color:#a3a3a3;">— Kirk Adamson, Founder</p>`;
      const drips = [
        { day: 1, subject: 'Module 1 is waiting for you', html: wrap(`<p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(userName)},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;"><strong>Module 1 — Service Foundations</strong> takes about 12 minutes and covers the mindset that separates good servers from great ones. It's the most-completed module on the platform for a reason.</p>${cta('Start Module 1 →', 'https://servemasteracademy.ca/app')}${sig}`) },
        { day: 3, subject: 'Have you tried the AI voice roleplay?', html: wrap(`<p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(userName)},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">The <strong>AI Practice Scenarios</strong> let you talk with a realistic AI guest — a difficult customer, a wine question, a complaint mid-service — and get instant feedback on your handling. It's the closest thing to real floor experience without being on the floor.</p><p style="font-size:16px;line-height:1.7;margin-bottom:24px;">Try the Practice tab. First scenario takes under 3 minutes.</p>${cta('Try a Scenario →', 'https://servemasteracademy.ca/app')}${sig}`) },
        { day: 7, subject: 'One week in — 7 days left on your trial', html: wrap(`<p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(userName)},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Servers who complete at least 5 modules in their first two weeks are <strong>3× more likely</strong> to earn their certificate.</p><p style="font-size:16px;line-height:1.7;margin-bottom:24px;">You have 7 days left in your free trial. Your free access stays forever (3 modules, 5 scenarios), but the remaining 27 modules, 150+ scenarios, voice practice, and your certificate unlock with Premium.</p>${cta('Continue Training →', 'https://servemasteracademy.ca/app')}<p style="margin-bottom:32px;"><a href="https://servemasteracademy.ca/pricing" style="color:#d4af37;font-size:14px;">See Premium pricing →</a></p>${sig}`) },
        { day: 14, subject: 'Your trial ends today', html: wrap(`<p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(userName)},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Your 14-day trial ends today. Your progress, badges, and streak are saved — you keep free access to your first 3 modules permanently.</p><div style="background:#1a1a1a;border:1px solid #d4af37;border-radius:12px;padding:20px;margin-bottom:24px;"><p style="font-size:18px;font-weight:600;color:#d4af37;margin:0 0 4px;">Premium — $19/mo</p><p style="font-size:14px;color:#a3a3a3;margin:0;">Or save 35% with annual billing — $149/yr</p></div>${cta('Upgrade Now →', 'https://servemasteracademy.ca/pricing')}${sig}`) }
      ];
      for (const d of drips) {
        if (daysSinceSignup >= d.day && !sentDays.has(d.day)) {
          resend.emails.send({ from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>', to: userEmail, subject: d.subject, html: d.html }).catch(e => console.error(`Drip day ${d.day} error:`, e.message));
          await db.query('INSERT INTO email_drip_log (user_id, day_sent) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, d.day]);
          break;
        }
      }
    } catch (e) { console.error('Drip email error:', e.message); }
  }

  // ── Weekly manager digest ─────────────────────────────────────────────────
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

  async function sendWeeklyManagerDigests() {
    try {
      const now = new Date();
      const thisMonday  = _mostRecentMondayMidnightET(now);
      const lastMonday  = new Date(thisMonday.getTime()  - 7 * 24 * 60 * 60 * 1000);
      const prev2Monday = new Date(lastMonday.getTime()  - 7 * 24 * 60 * 60 * 1000);
      const weekLabel = `${lastMonday.toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'America/Toronto'})} – ${new Date(thisMonday.getTime()-1000).toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'America/Toronto'})}`;

      const managers = await db.query(`
        SELECT u.id, u.name, u.email, u.weekly_digest_enabled,
               r.id as restaurant_id, r.name as restaurant_name, r.cert_logo_url,
               r.wl_logo_url, r.wl_brand_name, r.wl_primary_color, r.wl_is_active
        FROM users u
        JOIN restaurants r ON r.manager_id = u.id
        WHERE u.is_unsubscribed IS NOT TRUE
          AND u.subscription_status NOT IN ('free')
          AND COALESCE(u.weekly_digest_enabled, TRUE) = TRUE
        ORDER BY u.id
      `);

      let sent = 0, skipped = 0;
      for (const mgr of managers.rows) {
        const team = await db.query(`
          SELECT u.name,
            COALESCE(agg.modules_done,0) as modules_done,
            COALESCE(agg.avg_score,0) as avg_score
          FROM restaurant_members rm
          JOIN users u ON u.id = rm.user_id
          LEFT JOIN (
            SELECT user_id,
              COUNT(*) FILTER (WHERE progress>=100) as modules_done,
              AVG(quiz_score) FILTER (WHERE quiz_score IS NOT NULL) as avg_score
            FROM user_progress GROUP BY user_id
          ) agg ON agg.user_id = rm.user_id
          WHERE rm.restaurant_id = $1
          ORDER BY modules_done DESC LIMIT 15
        `, [mgr.restaurant_id]);
        if (!team.rows.length) { skipped++; continue; }

        const [thisWeekR, prevWeekR, quizThisR, quizPrevR, scenThisR, scenPrevR] = await Promise.all([
          db.query(`SELECT COUNT(*) as cnt FROM user_progress p
            JOIN restaurant_members rm ON rm.user_id = p.user_id
            WHERE rm.restaurant_id = $1 AND p.progress >= 100
              AND p.completed_at >= $2 AND p.completed_at < $3`,
            [mgr.restaurant_id, lastMonday, thisMonday]),
          db.query(`SELECT COUNT(*) as cnt FROM user_progress p
            JOIN restaurant_members rm ON rm.user_id = p.user_id
            WHERE rm.restaurant_id = $1 AND p.progress >= 100
              AND p.completed_at >= $2 AND p.completed_at < $3`,
            [mgr.restaurant_id, prev2Monday, lastMonday]),
          db.query(`SELECT COALESCE(AVG(p.quiz_score),0) as avg FROM user_progress p
            JOIN restaurant_members rm ON rm.user_id = p.user_id
            WHERE rm.restaurant_id = $1 AND p.quiz_score IS NOT NULL
              AND p.updated_at >= $2 AND p.updated_at < $3`,
            [mgr.restaurant_id, lastMonday, thisMonday]),
          db.query(`SELECT COALESCE(AVG(p.quiz_score),0) as avg FROM user_progress p
            JOIN restaurant_members rm ON rm.user_id = p.user_id
            WHERE rm.restaurant_id = $1 AND p.quiz_score IS NOT NULL
              AND p.updated_at >= $2 AND p.updated_at < $3`,
            [mgr.restaurant_id, prev2Monday, lastMonday]),
          db.query(`SELECT COUNT(*) as cnt FROM scenario_scores ss
            JOIN restaurant_members rm ON rm.user_id = ss.user_id
            WHERE rm.restaurant_id = $1 AND ss.completed_at >= $2 AND ss.completed_at < $3`,
            [mgr.restaurant_id, lastMonday, thisMonday]),
          db.query(`SELECT COUNT(*) as cnt FROM scenario_scores ss
            JOIN restaurant_members rm ON rm.user_id = ss.user_id
            WHERE rm.restaurant_id = $1 AND ss.completed_at >= $2 AND ss.completed_at < $3`,
            [mgr.restaurant_id, prev2Monday, lastMonday])
        ]);
        const thisWeekCount = parseInt(thisWeekR.rows[0].cnt);
        const prevWeekCount = parseInt(prevWeekR.rows[0].cnt);
        const wow = thisWeekCount - prevWeekCount;
        const wowStr   = wow > 0 ? `+${wow}` : `${wow}`;
        const wowColor = wow > 0 ? '#34d399' : wow < 0 ? '#f87171' : '#a3a3a3';
        const quizThis = Math.round(Number(quizThisR.rows[0].avg));
        const quizPrev = Math.round(Number(quizPrevR.rows[0].avg));
        const quizWow  = quizThis - quizPrev;
        const quizWowStr   = quizWow > 0 ? `+${quizWow}` : `${quizWow}`;
        const quizWowColor = quizWow > 0 ? '#34d399' : quizWow < 0 ? '#f87171' : '#a3a3a3';
        const scenThis = parseInt(scenThisR.rows[0].cnt);
        const scenPrev = parseInt(scenPrevR.rows[0].cnt);
        const scenWow  = scenThis - scenPrev;
        const scenWowStr   = scenWow > 0 ? `+${scenWow}` : `${scenWow}`;
        const scenWowColor = scenWow > 0 ? '#34d399' : scenWow < 0 ? '#f87171' : '#a3a3a3';

        const wlActive = !!mgr.wl_is_active;
        const logoUrl = (wlActive && mgr.wl_logo_url) || mgr.cert_logo_url || 'https://servemasteracademy.ca/logo.png';
        const brandName = escapeHtml((wlActive && mgr.wl_brand_name) || mgr.restaurant_name);
        const brandColor = (wlActive && mgr.wl_primary_color) || '#d4af37';

        const [newCertsR, prevCertsR] = await Promise.all([
          db.query(`
            SELECT u.name FROM certificate_log cl
            JOIN users u ON u.id = cl.user_id
            JOIN restaurant_members rm ON rm.user_id = cl.user_id
            WHERE rm.restaurant_id = $1 AND cl.issued_at >= $2 AND cl.issued_at < $3
          `, [mgr.restaurant_id, lastMonday, thisMonday]),
          db.query(`
            SELECT COUNT(*) as cnt FROM certificate_log cl
            JOIN restaurant_members rm ON rm.user_id = cl.user_id
            WHERE rm.restaurant_id = $1 AND cl.issued_at >= $2 AND cl.issued_at < $3
          `, [mgr.restaurant_id, prev2Monday, lastMonday])
        ]);
        const certWow  = newCertsR.rows.length - parseInt(prevCertsR.rows[0].cnt);
        const certWowStr   = certWow > 0 ? `+${certWow}` : `${certWow}`;
        const certWowColor = certWow > 0 ? '#34d399' : certWow < 0 ? '#f87171' : '#a3a3a3';

        const certsHtml = newCertsR.rows.length
          ? `<div style="margin:16px 0;padding:12px 16px;background:#064e3b;border-radius:8px;font-size:13px;color:#34d399;">🎓 <strong>New certifications this week:</strong> ${newCertsR.rows.map(r=>escapeHtml(r.name)).join(', ')}</div>`
          : '';

        const rows = team.rows.map(s =>
          `<tr><td style="padding:8px 12px;border-bottom:1px solid #222;">${escapeHtml(s.name)}</td><td style="padding:8px 12px;border-bottom:1px solid #222;text-align:center;">${s.modules_done}/30</td><td style="padding:8px 12px;border-bottom:1px solid #222;text-align:center;">${s.avg_score ? Math.round(s.avg_score)+'%' : '—'}</td></tr>`
        ).join('');

        const unsubToken = await getOrCreateUnsubToken(mgr.id);
        const unsubUrl = `https://servemasteracademy.ca/unsubscribe?token=${unsubToken}`;

        resend.emails.send({
          from: 'ServeMaster Academy <kirk_adamson@servemasteracademy.ca>',
          to: mgr.email,
          subject: `Weekly Training Digest — ${mgr.restaurant_name} (${weekLabel})`,
          html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
            <table style="width:100%;border-collapse:collapse;margin-bottom:24px;"><tr>
              <td><img src="${logoUrl}" alt="${brandName}" style="width:48px;height:48px;border-radius:10px;object-fit:cover;"></td>
              <td style="padding-left:12px;vertical-align:middle;">
                <div style="font-size:18px;font-weight:700;color:${brandColor};">${brandName}</div>
                <div style="font-size:11px;color:#a3a3a3;">Powered by ServeMaster Academy</div>
              </td>
            </tr></table>
            <h2 style="font-size:18px;color:#f5f5f5;margin-bottom:4px;">Weekly Training Digest</h2>
            <p style="font-size:13px;color:#a3a3a3;margin-bottom:20px;">${weekLabel}</p>
            <table style="width:100%;border-collapse:collapse;background:#1a1a1a;border-radius:8px;margin-bottom:20px;"><tr>
              <td style="text-align:center;padding:12px 8px;border-right:1px solid #333;">
                <div style="font-size:22px;font-weight:700;color:#d4af37;">${thisWeekCount}</div>
                <div style="font-size:10px;color:#a3a3a3;margin-top:2px;text-transform:uppercase;letter-spacing:.05em;">Modules</div>
                <div style="font-size:10px;color:${wowColor};margin-top:1px;">${wowStr} vs prior</div>
              </td>
              <td style="text-align:center;padding:12px 8px;border-right:1px solid #333;">
                <div style="font-size:22px;font-weight:700;color:#a78bfa;">${scenThis}</div>
                <div style="font-size:10px;color:#a3a3a3;margin-top:2px;text-transform:uppercase;letter-spacing:.05em;">Scenarios</div>
                <div style="font-size:10px;color:${scenWowColor};margin-top:1px;">${scenWowStr} vs prior</div>
              </td>
              <td style="text-align:center;padding:12px 8px;border-right:1px solid #333;">
                <div style="font-size:22px;font-weight:700;color:${quizWowColor};">${quizThis > 0 ? quizThis+'%' : '—'}</div>
                <div style="font-size:10px;color:#a3a3a3;margin-top:2px;text-transform:uppercase;letter-spacing:.05em;">Avg Quiz</div>
                ${quizThis > 0 && quizPrev > 0 ? `<div style="font-size:10px;color:${quizWowColor};margin-top:1px;">${quizWowStr}pp vs prior</div>` : ''}
              </td>
              <td style="text-align:center;padding:12px 8px;">
                <div style="font-size:22px;font-weight:700;color:#34d399;">${newCertsR.rows.length}</div>
                <div style="font-size:10px;color:#a3a3a3;margin-top:2px;text-transform:uppercase;letter-spacing:.05em;">New Certs</div>
                <div style="font-size:10px;color:${certWowColor};margin-top:1px;">${certWowStr} vs prior</div>
              </td>
            </tr></table>
            ${certsHtml}
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead><tr style="background:#1a1a1a;">
                <th style="padding:8px 12px;text-align:left;color:#a3a3a3;font-size:10px;text-transform:uppercase;letter-spacing:.05em;">Staff Member</th>
                <th style="padding:8px 12px;text-align:center;color:#a3a3a3;font-size:10px;text-transform:uppercase;letter-spacing:.05em;">Modules</th>
                <th style="padding:8px 12px;text-align:center;color:#a3a3a3;font-size:10px;text-transform:uppercase;letter-spacing:.05em;">Avg Quiz</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
            <p style="margin-top:24px;"><a href="https://servemasteracademy.ca/manager-dashboard" style="background:${brandColor};color:#000;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px;">View Full Dashboard →</a></p>
            ${emailFooter(unsubUrl)}
          </div>`
        }).catch(e => console.error('Weekly digest error:', e.message));
        sent++;
      }
      return { sent, skipped };
    } catch (e) { console.error('Weekly digest error:', e.message); return { sent: 0, skipped: 0 }; }
  }

  return {
    escapeHtml,
    getTenantBrandingForEmail,
    sendTrialDripEmails,
    generateUnsubToken,
    getOrCreateUnsubToken,
    emailFooter,
    sendDripEmailIfDue,
    sendWeeklyManagerDigests,
  };
};
