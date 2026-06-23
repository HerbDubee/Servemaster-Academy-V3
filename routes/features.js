'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');

module.exports = function createFeaturesRouter({
  db, resend, authMiddleware, escapeHtml, ADMIN_EMAIL, getUncachableStripeClient,
}) {
  const router = express.Router();

  // ── Unsubscribe routes ───────────────────────────────────────────────────────
  router.get('/unsubscribe', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.redirect('/');
    try {
      const r = await db.query('SELECT user_id FROM unsubscribe_tokens WHERE token = $1', [token]);
      if (!r.rows.length) return res.sendFile(require('path').join(__dirname, '..', 'public', 'unsubscribe.html'));
      await db.query('UPDATE users SET is_unsubscribed = TRUE WHERE id = $1', [r.rows[0].user_id]);
      res.sendFile(require('path').join(__dirname, '..', 'public', 'unsubscribe.html'));
    } catch (e) { console.error('Unsubscribe GET error:', e.message); res.redirect('/'); }
  });

  router.post('/api/unsubscribe', async (req, res, next) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing token' });
    try {
      const r = await db.query('SELECT user_id FROM unsubscribe_tokens WHERE token = $1', [token]);
      if (!r.rows.length) return res.status(404).json({ error: 'Invalid token' });
      await db.query('UPDATE users SET is_unsubscribed = TRUE WHERE id = $1', [r.rows[0].user_id]);
      res.json({ success: true });
    } catch (e) { next(Object.assign(e, { publicMessage: 'Server error' })); }
  });

  router.post('/api/resubscribe', authMiddleware, async (req, res, next) => {
    try {
      await db.query('UPDATE users SET is_unsubscribed = FALSE WHERE id = $1', [req.user.id]);
      res.json({ success: true });
    } catch (e) { next(Object.assign(e, { publicMessage: 'Server error' })); }
  });

  // ── Scholarship routes ───────────────────────────────────────────────────────
  const scholarshipLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many submissions. Please try again later.' } });

  const SCHOLARSHIP_MONTHLY_CAP = 15;

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

  router.get('/api/scholarship/spots', async (req, res, next) => {
    try {
      const used = await getMonthlyApprovedCount();
      res.json({ remaining: Math.max(0, SCHOLARSHIP_MONTHLY_CAP - used), used, cap: SCHOLARSHIP_MONTHLY_CAP });
    } catch (e) { next(Object.assign(e, { publicMessage: 'Server error' })); }
  });

  router.post('/api/scholarship/apply', scholarshipLimiter, async (req, res, next) => {
    const { name, email, phone, years_experience, motivation } = req.body || {};
    if (!name || !email || !years_experience || !motivation) {
      return res.status(400).json({ error: 'Please fill in all required fields.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (motivation.trim().length < 30) {
      return res.status(400).json({ error: 'Please tell us a bit more about why you want to level up (at least 30 characters).' });
    }
    try {
      const dup = await db.query(`SELECT id FROM scholarship_applications WHERE email = $1 AND status != 'rejected'`, [email.toLowerCase().trim()]);
      if (dup.rows.length) {
        return res.status(409).json({ error: 'An application from this email address already exists. Check your inbox for updates.' });
      }
      const result = await db.query(
        `INSERT INTO scholarship_applications (name, email, phone, motivation, years_experience)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [name.trim(), email.toLowerCase().trim(), phone ? phone.trim() : null, motivation.trim(), years_experience]
      );
      const spots = await getMonthlyApprovedCount();
      const safeName = escapeHtml(name.trim());
      resend.emails.send({
        from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
        to: email.toLowerCase().trim(),
        subject: 'We received your scholarship application — ServeMaster Academy',
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${safeName},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Thank you for applying for the Career Launch Scholarship. I received your application and I review every one personally.</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">You'll hear back from me within a few business days.</p><p style="font-size:15px;line-height:1.7;color:#a3a3a3;margin-top:32px;"><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy<br><a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#FF5E3A;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a></p><hr style="border:none;border-top:1px solid #333;margin:32px 0;"><p style="font-size:11px;color:#555;text-align:center;">ServeMaster Academy · <a href="https://servemasteracademy.ca" style="color:#555;">servemasteracademy.ca</a></p></div>`
      }).catch(e => console.error('Scholarship confirmation email error:', e.message));
      resend.emails.send({
        from: 'ServeMaster Academy <kirk_adamson@servemasteracademy.ca>',
        to: ADMIN_EMAIL || 'kirk_adamson@servemasteracademy.ca',
        subject: `New scholarship application — ${name.trim()}`,
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:32px;border-radius:12px;"><h2 style="color:#FF5E3A;margin-bottom:16px;">New Scholarship Application</h2><p><strong>Name:</strong> ${safeName}</p><p><strong>Email:</strong> ${escapeHtml(email)}</p><p><strong>Phone:</strong> ${phone ? escapeHtml(phone) : 'Not provided'}</p><p><strong>Experience:</strong> ${escapeHtml(years_experience)}</p><p><strong>Motivation:</strong></p><blockquote style="border-left:3px solid #FF5E3A;padding-left:12px;color:#d4d4d8;margin:8px 0;">${escapeHtml(motivation.trim())}</blockquote><p style="margin-top:20px;font-size:13px;color:#71717a;">Monthly approvals so far: ${spots}/${SCHOLARSHIP_MONTHLY_CAP}</p><p><a href="https://servemasteracademy.ca/admin" style="background:#FF5E3A;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Review in Admin Dashboard</a></p></div>`
      }).catch(e => console.error('Admin notification email error:', e.message));
      res.json({ success: true, id: result.rows[0].id });
    } catch (e) {
      console.error('Scholarship apply error:', e.message);
      next(Object.assign(e, { publicMessage: 'Server error. Please try again.' }));
    }
  });

  router.get('/api/user/scholarship-status', authMiddleware, async (req, res, next) => {
    try {
      const appRes = await db.query(
        `SELECT sa.id, sa.status, sa.invite_code, sa.grad_at, sa.testimonial, sa.share_contact
         FROM scholarship_applications sa
         JOIN invite_code_redemptions icr ON icr.code = sa.invite_code
         WHERE icr.user_id = $1 AND sa.status IN ('approved','completed')
         LIMIT 1`,
        [req.user.id]
      );
      if (!appRes.rows.length) return res.json({ scholarship: null });
      const schol = appRes.rows[0];
      const progressRes = await db.query(
        `SELECT COUNT(*) FILTER (WHERE progress >= 100) as modules_done,
                AVG(quiz_score) FILTER (WHERE quiz_score IS NOT NULL) as avg_quiz
         FROM user_progress WHERE user_id = $1`,
        [req.user.id]
      );
      const scenarioRes = await db.query(
        `SELECT COUNT(*) as cnt FROM scenario_scores WHERE user_id = $1`,
        [req.user.id]
      );
      const modulesDone = parseInt(progressRes.rows[0].modules_done) || 0;
      const avgQuiz = parseFloat(progressRes.rows[0].avg_quiz) || 0;
      const scenariosDone = parseInt(scenarioRes.rows[0].cnt) || 0;
      const requirementsMet = modulesDone >= 30 && avgQuiz >= 80 && scenariosDone >= 15;
      res.json({
        scholarship: {
          id: schol.id,
          status: schol.status,
          grad_at: schol.grad_at,
          testimonial: schol.testimonial,
          share_contact: schol.share_contact,
          requirements: {
            modules_done: modulesDone,
            modules_target: 30,
            avg_quiz: Math.round(avgQuiz),
            quiz_target: 80,
            scenarios_done: scenariosDone,
            scenarios_target: 15,
            testimonial_submitted: !!schol.testimonial,
            all_met: requirementsMet && !!schol.testimonial
          }
        }
      });
    } catch (e) {
      console.error('Scholarship status error:', e.message);
      next(Object.assign(e, { publicMessage: 'Server error' }));
    }
  });

  router.post('/api/scholarship/testimonial', authMiddleware, async (req, res, next) => {
    const { testimonial, share_contact } = req.body || {};
    if (!testimonial || testimonial.trim().length < 20) {
      return res.status(400).json({ error: 'Please write at least 20 characters for your testimonial.' });
    }
    try {
      const appRes = await db.query(
        `SELECT sa.id, sa.status, sa.email, sa.name
         FROM scholarship_applications sa
         JOIN invite_code_redemptions icr ON icr.code = sa.invite_code
         WHERE icr.user_id = $1 AND sa.status IN ('approved','completed')
         LIMIT 1`,
        [req.user.id]
      );
      if (!appRes.rows.length) return res.status(404).json({ error: 'No active scholarship found for this account.' });
      const schol = appRes.rows[0];
      const progressRes = await db.query(
        `SELECT COUNT(*) FILTER (WHERE progress >= 100) as modules_done,
                AVG(quiz_score) FILTER (WHERE quiz_score IS NOT NULL) as avg_quiz
         FROM user_progress WHERE user_id = $1`,
        [req.user.id]
      );
      const scenarioRes = await db.query(`SELECT COUNT(*) as cnt FROM scenario_scores WHERE user_id = $1`, [req.user.id]);
      const modulesDone = parseInt(progressRes.rows[0].modules_done) || 0;
      const avgQuiz = parseFloat(progressRes.rows[0].avg_quiz) || 0;
      const scenariosDone = parseInt(scenarioRes.rows[0].cnt) || 0;
      const requirementsMet = modulesDone >= 30 && avgQuiz >= 80 && scenariosDone >= 15;
      const newStatus = requirementsMet ? 'completed' : schol.status;
      await db.query(
        `UPDATE scholarship_applications SET testimonial = $1, share_contact = $2, status = $3, grad_at = CASE WHEN $3 = 'completed' AND grad_at IS NULL THEN NOW() ELSE grad_at END WHERE id = $4`,
        [testimonial.trim(), share_contact === true, newStatus, schol.id]
      );
      if (newStatus === 'completed' && schol.status !== 'completed') {
        const safeName = escapeHtml(schol.name);
        resend.emails.send({
          from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
          to: schol.email,
          subject: "Congratulations — you've completed the Career Launch Scholarship!",
          html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${safeName},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">You've done it. You've completed the <strong style="color:#FF5E3A;">Career Launch Scholarship</strong> — all 30 modules, 80%+ quiz average, 15+ role-play scenarios, and your testimonial.</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">You are now a <strong>ServeMaster Academy Certified Server</strong>. Your certificate is available in the app, and ${share_contact ? "you've been added to the Job-Ready Graduate List — restaurant managers can now find you." : "you can opt into the Job-Ready Graduate List any time from the app."}</p><p style="margin-bottom:32px;"><a href="https://servemasteracademy.ca/app" style="background:#FF5E3A;color:#fff;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">View Your Certificate</a></p><p style="font-size:16px;line-height:1.7;margin-top:32px;color:#a3a3a3;"><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy</p><hr style="border:none;border-top:1px solid #333;margin:32px 0;"><p style="font-size:11px;color:#555;text-align:center;">ServeMaster Academy · <a href="https://servemasteracademy.ca" style="color:#555;">servemasteracademy.ca</a></p></div>`
        }).catch(e => console.error('Scholarship graduation email error:', e.message));
      }
      res.json({ success: true, completed: newStatus === 'completed' });
    } catch (e) {
      console.error('Testimonial submit error:', e.message);
      next(Object.assign(e, { publicMessage: 'Server error' }));
    }
  });

  // ── Affiliate / Influencer routes ────────────────────────────────────────────
  const affiliateLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many submissions. Please try again later.' } });

  router.post('/api/affiliate/apply', affiliateLimiter, async (req, res, next) => {
    const { name, email, platform, handle, followers, audience_desc, website, pref_language, pref_payout_method } = req.body;
    if (!name || !email || !platform || !handle) return res.status(400).json({ error: 'Missing required fields' });
    const safeName = escapeHtml(name.trim());
    const safeEmail = email.toLowerCase().trim();
    const safeLang = ['en','fr','es'].includes(pref_language) ? pref_language : 'en';
    try {
      const dup = await db.query(`SELECT id FROM influencers WHERE email = $1`, [safeEmail]);
      if (dup.rows.length) return res.status(409).json({ error: 'An application with this email already exists.' });
      await db.query(
        `INSERT INTO influencers (name, email, platform, handle, followers, audience_desc, website, pref_language, pref_payout_method) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [safeName, safeEmail, platform.trim(), handle.trim(), parseInt(followers) || null, (audience_desc || '').trim() || null, (website || '').trim() || null, safeLang, (pref_payout_method || '').trim() || null]
      );
      resend.emails.send({
        from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
        to: safeEmail,
        subject: 'We received your partner application — ServeMaster Academy',
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${safeName},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Thank you for applying to the <strong style="color:#FF5E3A;">ServeMaster Partners Program</strong>. I review every application personally and will get back to you within a few business days.</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">If approved, you'll receive your unique tracking link, your $100 welcome bonus details, and full program resources by email.</p><p style="font-size:16px;line-height:1.7;margin-top:32px;color:#a3a3a3;"><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy</p></div>`
      }).catch(e => console.error('Affiliate apply email error:', e.message));
      resend.emails.send({
        from: 'ServeMaster Academy <kirk_adamson@servemasteracademy.ca>',
        to: ADMIN_EMAIL,
        subject: `New partner application — ${safeName} (${handle} on ${platform})`,
        html: `<div style="font-family:monospace;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:32px;border-radius:12px;"><h2 style="color:#FF5E3A;margin-top:0;">New Partner Application</h2><table style="width:100%;border-collapse:collapse;font-size:14px;"><tr><td style="padding:6px 0;color:#a3a3a3;width:160px;">Name</td><td style="padding:6px 0;color:#f5f5f5;">${safeName}</td></tr><tr><td style="padding:6px 0;color:#a3a3a3;">Email</td><td style="padding:6px 0;color:#f5f5f5;">${safeEmail}</td></tr><tr><td style="padding:6px 0;color:#a3a3a3;">Platform</td><td style="padding:6px 0;color:#f5f5f5;">${escapeHtml(platform)}</td></tr><tr><td style="padding:6px 0;color:#a3a3a3;">Handle</td><td style="padding:6px 0;color:#f5f5f5;">@${escapeHtml(handle)}</td></tr><tr><td style="padding:6px 0;color:#a3a3a3;">Website</td><td style="padding:6px 0;color:#f5f5f5;">${escapeHtml(website || '—')}</td></tr><tr><td style="padding:6px 0;color:#a3a3a3;">Followers</td><td style="padding:6px 0;color:#f5f5f5;">${followers ? Number(followers).toLocaleString() : '—'}</td></tr><tr><td style="padding:6px 0;color:#a3a3a3;">Preferred Language</td><td style="padding:6px 0;color:#f5f5f5;">${safeLang.toUpperCase()}</td></tr><tr><td style="padding:6px 0;color:#a3a3a3;">Payout Method</td><td style="padding:6px 0;color:#f5f5f5;">${escapeHtml(pref_payout_method || '—')}</td></tr><tr><td style="padding:6px 0;color:#a3a3a3;vertical-align:top;">Audience</td><td style="padding:6px 0;color:#f5f5f5;">${escapeHtml(audience_desc || '—')}</td></tr></table><p style="margin-top:24px;"><a href="https://servemasteracademy.ca/admin" style="background:#FF5E3A;color:#fff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600;">Review in Admin Dashboard</a></p></div>`
      }).catch(e => console.error('Admin affiliate notify error:', e.message));
      res.json({ success: true });
    } catch (e) {
      console.error('Affiliate apply error:', e.message);
      next(Object.assign(e, { publicMessage: 'Server error' }));
    }
  });

  router.get('/api/affiliate/onboarding-refresh/:ref_code', async (req, res) => {
    const { ref_code } = req.params;
    if (!ref_code) return res.status(400).send('Missing ref_code');
    try {
      const aff = await db.query(
        `SELECT id, stripe_connect_id FROM influencers WHERE ref_code = $1 AND status = 'approved' AND stripe_connect_id IS NOT NULL`,
        [ref_code.trim()]
      );
      if (!aff.rows.length) return res.status(404).send('Affiliate not found');
      const stripe = await getUncachableStripeClient();
      const APP_URL = process.env.APP_URL || 'https://servemasteracademy.ca';
      const link = await stripe.accountLinks.create({
        account: aff.rows[0].stripe_connect_id,
        refresh_url: `${APP_URL}/api/affiliate/onboarding-refresh/${ref_code}`,
        return_url: `${APP_URL}/partner-onboarding-complete`,
        type: 'account_onboarding'
      });
      return res.redirect(link.url);
    } catch (e) {
      console.error('Onboarding refresh error:', e.message);
      return res.status(500).send('Unable to refresh onboarding link. Please contact support.');
    }
  });

  // ── Monthly affiliate summary email scheduler ────────────────────────────────
  (function scheduleMonthlyAffiliateEmails() {
    async function runMonthlyAffiliateEmails() {
      const now = new Date();
      if (now.getDate() !== 1) return;
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthStart = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
      try {
        const approved = await db.query(`SELECT * FROM influencers WHERE status = 'approved'`);
        for (const inf of approved.rows) {
          try {
            const cnt = await db.query(
              `SELECT COUNT(*) as cnt FROM influencer_commissions WHERE influencer_id = $1 AND commission_type = 'sale' AND created_at >= $2 AND created_at < $3`,
              [inf.id, prevMonthStart, prevMonthEnd]
            );
            const sales = parseInt(cnt.rows[0].cnt);
            const newTier = sales >= 16 ? 'gold' : sales >= 6 ? 'silver' : 'bronze';
            if (newTier !== inf.tier) {
              await db.query(`UPDATE influencers SET tier = $1 WHERE id = $2`, [newTier, inf.id]);
            }
          } catch (e) { console.error('Tier update error for', inf.email, e.message); }
        }
        for (const inf of approved.rows) {
          try {
            const alreadySent = await db.query(
              `SELECT 1 FROM influencer_monthly_email_log WHERE influencer_id = $1 AND month_key = $2`, [inf.id, monthKey]
            );
            if (alreadySent.rows.length) continue;
            const allTime = await db.query(
              `SELECT COUNT(*) FILTER (WHERE commission_type = 'sale') as cnt,
                      COALESCE(SUM(amount_cad),0) as total
               FROM influencer_commissions WHERE influencer_id = $1`, [inf.id]
            );
            if (parseInt(allTime.rows[0].cnt) === 0) continue;
            const thisMonth = await db.query(
              `SELECT COUNT(*) FILTER (WHERE commission_type = 'sale') as cnt,
                      COALESCE(SUM(amount_cad) FILTER (WHERE commission_type = 'sale'),0) as earned,
                      COALESCE(SUM(amount_cad) FILTER (WHERE commission_type = 'welcome_bonus'),0) as welcome_bonus
               FROM influencer_commissions WHERE influencer_id = $1 AND created_at >= $2 AND created_at < $3`,
              [inf.id, prevMonthStart, prevMonthEnd]
            );
            const pending = await db.query(
              `SELECT COALESCE(SUM(amount_cad + activation_bonus),0) as total FROM influencer_commissions WHERE influencer_id = $1 AND status IN ('pending','payout_ready')`, [inf.id]
            );
            const safeName = escapeHtml(inf.name);
            const link = `https://servemasteracademy.ca/r/${inf.ref_code}`;
            await resend.emails.send({
              from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
              to: inf.email,
              subject: `Your ServeMaster Academy affiliate summary — ${prevMonth.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}`,
              html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><p style="font-size:16px;line-height:1.7;margin-bottom:8px;">Hi ${safeName},</p><p style="font-size:14px;color:#a3a3a3;margin-bottom:24px;">Here's your affiliate summary for ${prevMonth.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}.</p><div style="display:grid;gap:12px;margin-bottom:24px;"><div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:16px;display:flex;justify-content:space-between;align-items:center;"><span style="color:#a3a3a3;font-size:14px;">New conversions this month</span><span style="color:#FF5E3A;font-weight:700;font-size:18px;">${thisMonth.rows[0].cnt}</span></div><div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:16px;display:flex;justify-content:space-between;align-items:center;"><span style="color:#a3a3a3;font-size:14px;">Earned this month</span><span style="color:#FF5E3A;font-weight:700;font-size:18px;">$${parseFloat(thisMonth.rows[0].earned).toFixed(2)} CAD</span></div><div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:16px;display:flex;justify-content:space-between;align-items:center;"><span style="color:#a3a3a3;font-size:14px;">Pending payout</span><span style="color:#f5f5f5;font-weight:700;font-size:18px;">$${parseFloat(pending.rows[0].total).toFixed(2)} CAD</span></div><div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:16px;display:flex;justify-content:space-between;align-items:center;"><span style="color:#a3a3a3;font-size:14px;">All-time total earned</span><span style="color:#f5f5f5;font-weight:700;font-size:18px;">$${parseFloat(allTime.rows[0].total).toFixed(2)} CAD</span></div></div><p style="margin-bottom:16px;"><a href="${link}" style="background:#FF5E3A;color:#fff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:15px;">Share your link →</a></p><p style="font-size:13px;color:#71717a;">Your referral link: <a href="${link}" style="color:#FF5E3A;">${link}</a></p></div>`
            });
            await db.query(
              `INSERT INTO influencer_monthly_email_log (influencer_id, month_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [inf.id, monthKey]
            );
            console.log(`Monthly affiliate email sent to ${inf.email}`);
          } catch (emailErr) { console.error('Monthly affiliate email error for', inf.email, emailErr.message); }
        }
      } catch (e) { console.error('Monthly affiliate email job error:', e.message); }
    }
    setInterval(runMonthlyAffiliateEmails, 6 * 60 * 60 * 1000);
    setTimeout(runMonthlyAffiliateEmails, 30000);
  })();

  return router;
};
