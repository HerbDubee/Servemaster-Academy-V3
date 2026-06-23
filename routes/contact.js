'use strict';
const express = require('express');
const { validate } = require('../middleware/validate');
const {
  newsletterSchema, contactSchema, teamTrialSchema,
  enterpriseSchema, referralInviteSchema, inviteRedeemSchema,
} = require('../lib/schemas');

module.exports = function createContactRouter({
  db, resend, authMiddleware, contactLimiter, escapeHtml, highestPlan, ADMIN_EMAIL,
}) {
  const router = express.Router();

  function extractUtm(req) {
    const q = req.query || {};
    return {
      source:   (q.utm_source   || '').toString().slice(0, 64) || null,
      medium:   (q.utm_medium   || '').toString().slice(0, 64) || null,
      campaign: (q.utm_campaign || '').toString().slice(0, 64) || null,
      content:  (q.utm_content  || '').toString().slice(0, 64) || null,
      referrer: (req.get('referer') || '').slice(0, 255) || null,
    };
  }

  // ── Newsletter subscribe ────────────────────────────────────────────────────

  router.post('/api/newsletter/subscribe', contactLimiter, validate(newsletterSchema), async (req, res, next) => {
    const { email, firstName, source, role } = req.body;
    const safeSource = (source || 'newsletter').toString().slice(0, 64);
    try {
      await db.query(
        'INSERT INTO email_subscribers (email, first_name, source) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET active = TRUE, source = COALESCE(EXCLUDED.source, email_subscribers.source)',
        [email.toLowerCase(), firstName || '', safeSource]
      );
      if (safeSource === 'checklist') {
        const greeting = firstName ? escapeHtml(firstName) : 'there';
        await resend.emails.send({
          from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
          to: email.toLowerCase(),
          subject: 'Your Restaurant Training Consistency Checklist',
          html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
  <p style="font-size:16px;line-height:1.7;">Hi ${greeting},</p>
  <p style="font-size:16px;line-height:1.7;">Here's your <strong>Restaurant Training Consistency Checklist</strong> — 15 practical checkpoints to run through before putting any new server on the floor.</p>
  <div style="background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:28px;margin:28px 0;">
    <p style="font-size:13px;font-weight:bold;color:#FBBF24;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 20px;">Restaurant Training Consistency Checklist</p>
    <ol style="font-size:15px;line-height:2;color:#e5e5e5;padding-left:20px;margin:0;">
      <li>New hire orientation completed in person before first floor shift</li>
      <li>Table section, station layout, and side work responsibilities clearly communicated</li>
      <li>Menu knowledge test passed — dishes, allergens, and dietary substitutions covered</li>
      <li>Beverage and wine pairing basics reviewed with the new hire</li>
      <li>POS system walk-through completed and confirmed</li>
      <li>Table set-up and reset standards demonstrated and observed</li>
      <li>Specials, features, and 86'd items briefed every shift (pre-shift ritual established)</li>
      <li>Upselling and suggestive-selling language reviewed before service</li>
      <li>Guest complaint handling procedure reviewed and confirmed understood</li>
      <li>End-of-shift side work assignments posted and checked by manager</li>
      <li>Allergy and dietary restriction escalation protocol reviewed and signed off</li>
      <li>Peer coaching or buddy system assigned for the first two weeks</li>
      <li>Shift debrief held after every close — at least for the first month</li>
      <li>Module completion tracked weekly via manager dashboard</li>
      <li>Certification pathway communicated to every new hire on day one</li>
    </ol>
  </div>
  <p style="font-size:15px;line-height:1.7;color:#a3a3a3;">Print it out, stick it in your onboarding folder, and run through it before every new hire hits the floor.</p>
  <p style="font-size:15px;line-height:1.7;color:#a3a3a3;">If you want to put this checklist on autopilot — automated training, progress tracking, and certifications for your whole team — <a href="https://servemasteracademy.ca/managers" style="color:#FBBF24;text-decoration:none;">take a look at what ServeMaster Academy does for managers</a>.</p>
  <p style="font-size:15px;color:#a3a3a3;margin-top:32px;">Any questions? Just reply here.<br><strong style="color:#f5f5f5;">Kirk</strong><br><a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#FF5E3A;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a></p>
  <p style="font-size:11px;color:#555;margin-top:32px;border-top:1px solid #222;padding-top:16px;">You're receiving this because you requested the checklist at servemasteracademy.ca/checklist. <a href="https://servemasteracademy.ca/unsubscribe?email=${encodeURIComponent(email.toLowerCase())}" style="color:#555;">Unsubscribe</a>.</p>
</div>`
        }).catch(err => console.error('Checklist email send error:', err.message));
        const checklistInternalTo = ADMIN_EMAIL || 'kirk_adamson@servemasteracademy.ca';
        resend.emails.send({
          from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
          to: checklistInternalTo,
          subject: `New checklist signup — ${firstName ? escapeHtml(firstName) : email.toLowerCase()}`,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9f9f9;border-radius:8px;">
          <h2 style="font-size:18px;margin-bottom:16px;color:#111;">New Checklist Signup</h2>
          <table style="font-size:14px;border-collapse:collapse;width:100%;">
            <tr><td style="padding:6px 12px 6px 0;color:#555;white-space:nowrap;"><strong>Name</strong></td><td style="padding:6px 0;">${firstName ? escapeHtml(firstName) : '—'}</td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#555;white-space:nowrap;"><strong>Email</strong></td><td style="padding:6px 0;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#555;white-space:nowrap;"><strong>Role</strong></td><td style="padding:6px 0;">${role ? escapeHtml(role) : '—'}</td></tr>
          </table>
        </div>`
        }).catch(err => console.error('Checklist internal notification error:', err.message));
      }
      res.json({ success: true });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Subscription failed' })); }
  });

  // ── Contact form ────────────────────────────────────────────────────────────

  router.post('/api/contact', contactLimiter, validate(contactSchema), async (req, res, next) => {
    const { name, email, message } = req.body;
    try {
      await db.query('INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3)', [name, email.toLowerCase(), message]);
      const internalTo = ADMIN_EMAIL || 'kirk_adamson@servemasteracademy.ca';
      resend.emails.send({
        from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
        to: internalTo,
        subject: `New contact message from ${escapeHtml(name)}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9f9f9;border-radius:8px;">
        <h2 style="font-size:18px;margin-bottom:16px;color:#111;">New Contact Message</h2>
        <table style="font-size:14px;border-collapse:collapse;width:100%;">
          <tr><td style="padding:6px 12px 6px 0;color:#555;white-space:nowrap;"><strong>Name</strong></td><td style="padding:6px 0;">${escapeHtml(name)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#555;white-space:nowrap;"><strong>Email</strong></td><td style="padding:6px 0;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
        </table>
        <p style="font-size:14px;color:#111;margin-top:16px;"><strong>Message:</strong><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
      </div>`
      }).catch(e => console.error('Contact message internal notification error:', e.message));
      res.json({ success: true });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to send message' })); }
  });

  // ── Team trial request ──────────────────────────────────────────────────────

  router.post('/api/request-team-trial', contactLimiter, validate(teamTrialSchema), async (req, res, next) => {
    const { name, email, restaurantName, staffCount } = req.body;
    const restName = restaurantName;
    try {
      const utm = extractUtm(req);
      await db.query(
        'INSERT INTO contact_messages (name, email, message, utm_source, utm_medium, utm_campaign, utm_content, attribution_referrer) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [name, email.toLowerCase(), `[TEAM TRIAL REQUEST] Restaurant: ${restName}${staffCount ? ` | Staff: ${staffCount}` : ''}`, utm.source, utm.medium, utm.campaign, utm.content, utm.referrer]
      );
      await resend.emails.send({
        from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
        to: email.toLowerCase(),
        subject: 'Your ServeMaster Academy team trial request — received',
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
        <p style="font-size:16px;line-height:1.7;">Hi ${escapeHtml(name)},</p>
        <p style="font-size:16px;line-height:1.7;">Thanks for requesting a 30-day team trial for <strong>${escapeHtml(restName)}</strong>. I've got your request and will send your access code within 1 business day.</p>
        <p style="font-size:16px;line-height:1.7;">Once you have the code, your whole team can start training immediately — no credit card needed.</p>
        <p style="font-size:15px;color:#a3a3a3;margin-top:32px;">Any questions? Just reply to this email.<br><strong style="color:#f5f5f5;">Kirk</strong><br><a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#FF5E3A;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a></p>
      </div>`
      });
      const internalTo = ADMIN_EMAIL || 'kirk_adamson@servemasteracademy.ca';
      resend.emails.send({
        from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
        to: internalTo,
        subject: `New demo request — ${escapeHtml(name)} (${escapeHtml(restName)})`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9f9f9;border-radius:8px;">
        <h2 style="font-size:18px;margin-bottom:16px;color:#111;">New Team Trial Request</h2>
        <table style="font-size:14px;border-collapse:collapse;width:100%;">
          <tr><td style="padding:6px 12px 6px 0;color:#555;white-space:nowrap;"><strong>Name</strong></td><td style="padding:6px 0;">${escapeHtml(name)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#555;white-space:nowrap;"><strong>Email</strong></td><td style="padding:6px 0;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#555;white-space:nowrap;"><strong>Restaurant</strong></td><td style="padding:6px 0;">${escapeHtml(restName)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#555;white-space:nowrap;"><strong>Team size</strong></td><td style="padding:6px 0;">${staffCount ? escapeHtml(String(staffCount)) : '—'}</td></tr>
        </table>
      </div>`
      }).catch(e => console.error('Demo request internal notification error:', e.message));
      res.json({ success: true });
    } catch (err) {
      console.error('Team trial request error:', err.message);
      next(Object.assign(err, { publicMessage: 'Failed to send request' }));
    }
  });

  // ── Enterprise inquiry ──────────────────────────────────────────────────────

  router.post('/api/enterprise-request', contactLimiter, validate(enterpriseSchema), async (req, res, next) => {
    const { name, email, company, locations, message } = req.body;
    try {
      const fullMessage = `Company: ${company}\nLocations: ${locations || 'Not specified'}\n\n${message || ''}`.trim();
      await db.query('INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3)', [name, email.toLowerCase(), `[ENTERPRISE] ${fullMessage}`]);
      if (ADMIN_EMAIL) {
        resend.emails.send({
          from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
          to: ADMIN_EMAIL,
          subject: `Enterprise Inquiry from ${company} — ${name}`,
          html: `<h2>New Enterprise Inquiry</h2><table style="font-family:sans-serif;font-size:14px"><tr><td><b>Name</b></td><td>${escapeHtml(name)}</td></tr><tr><td><b>Email</b></td><td>${escapeHtml(email)}</td></tr><tr><td><b>Company</b></td><td>${escapeHtml(company)}</td></tr><tr><td><b>Locations</b></td><td>${escapeHtml(locations || 'Not specified')}</td></tr></table><p><b>Message:</b><br>${escapeHtml(message || 'No message provided').replace(/\n/g, '<br>')}</p>`
        }).catch(e => console.error('Enterprise inquiry email error:', e.message));
      }
      res.json({ success: true });
    } catch (err) {
      console.error('Enterprise request error:', err.message);
      next(Object.assign(err, { publicMessage: 'Failed to send request' }));
    }
  });

  // ── Referral: invite a manager ──────────────────────────────────────────────

  router.post('/api/referral/invite-manager', authMiddleware, contactLimiter, validate(referralInviteSchema), async (req, res, next) => {
    const { managerEmail, note } = req.body;
    const sender = req.user;
    try {
      await db.query(
        'INSERT INTO referrals (referrer_user_id, referred_email) VALUES ($1, $2) ON CONFLICT (referrer_user_id, referred_email) DO NOTHING',
        [sender.id, managerEmail.toLowerCase()]
      );
      resend.emails.send({
        from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
        to: managerEmail,
        subject: `${escapeHtml(sender.name)} thinks ServeMaster Academy could help your team`,
        html: `
          <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
            <img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;">
            <h2 style="font-size:22px;margin-bottom:16px;color:#fbbf24;">Your server ${escapeHtml(sender.name)} recommended us</h2>
            <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi,</p>
            <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">
              <strong>${escapeHtml(sender.name)}</strong> is using ServeMaster Academy to sharpen their fine-dining skills and thought you'd benefit from it for your whole team.
            </p>
            ${note ? `<p style="font-size:15px;line-height:1.7;background:#1c1c1c;padding:16px;border-left:3px solid #fbbf24;border-radius:6px;margin-bottom:20px;">"${escapeHtml(note)}"<br><em>— ${escapeHtml(sender.name)}</em></p>` : ''}
            <p style="font-size:16px;line-height:1.7;margin-bottom:24px;">ServeMaster Academy gives your servers AI role-play, voice practice, and gamified modules that reduce onboarding time and raise tip averages — all trackable from a manager dashboard.</p>
            <a href="https://servemasteracademy.ca/managers" style="display:inline-block;background:#fbbf24;color:#000;font-weight:bold;padding:14px 32px;border-radius:12px;text-decoration:none;font-size:16px;">See How It Works →</a>
            <p style="font-size:13px;color:#71717a;margin-top:32px;">Team plans start at $49 for your first 30 days. Questions? Reply to this email.</p>
          </div>
        `
      });
      resend.emails.send({
        from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
        to: 'kirk_adamson@servemasteracademy.ca',
        subject: `Referral: ${sender.name} invited ${managerEmail}`,
        html: `<p>User <strong>${escapeHtml(sender.name)}</strong> (${escapeHtml(sender.email)}) referred manager email <strong>${escapeHtml(managerEmail)}</strong>.</p>${note ? `<p>Note: "${escapeHtml(note)}"</p>` : ''}`
      });
      res.json({ success: true });
    } catch (err) {
      console.error('Referral invite error:', err.message);
      next(Object.assign(err, { publicMessage: 'Failed to send invite' }));
    }
  });

  // ── Invite code redeem ──────────────────────────────────────────────────────

  router.post('/api/invite/redeem', authMiddleware, validate(inviteRedeemSchema), async (req, res, next) => {
    try {
      const { code } = req.body;
      const codeRes = await db.query('SELECT * FROM invite_codes WHERE code = $1', [code.trim().toUpperCase()]);
      if (!codeRes.rows.length) return res.status(404).json({ error: 'Invalid invite code' });
      const ic = codeRes.rows[0];
      if (ic.expires_at && new Date(ic.expires_at) < new Date()) return res.status(400).json({ error: 'This invite code has expired' });
      if (ic.uses_count >= ic.max_uses) return res.status(400).json({ error: 'This invite code has reached its usage limit' });
      const already = await db.query('SELECT id FROM invite_code_redemptions WHERE code = $1 AND user_id = $2', [ic.code, req.user.id]);
      if (already.rows.length) return res.status(400).json({ error: 'You have already redeemed this code' });
      await db.query('INSERT INTO invite_code_redemptions (code, user_id) VALUES ($1, $2)', [ic.code, req.user.id]);
      await db.query('UPDATE invite_codes SET uses_count = uses_count + 1 WHERE code = $1', [ic.code]);
      const inviteAccessExpiresAt = ic.access_days
        ? new Date(Date.now() + ic.access_days * 24 * 60 * 60 * 1000)
        : null;
      await db.query(
        'UPDATE users SET subscription_status = $1, is_trial_active = false, trial_ends_at = NULL, invite_access_expires_at = $3 WHERE id = $2',
        [ic.plan, req.user.id, inviteAccessExpiresAt]
      );
      const userRes = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
      const user = userRes.rows[0];
      const restaurant = user.restaurant_id ? (await db.query('SELECT * FROM restaurants WHERE id = $1', [user.restaurant_id])).rows[0] : null;
      const effective_plan = highestPlan(user.subscription_status, restaurant?.plan);
      res.json({ ok: true, plan: ic.plan, effective_plan });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to redeem invite code' })); }
  });

  return router;
};
