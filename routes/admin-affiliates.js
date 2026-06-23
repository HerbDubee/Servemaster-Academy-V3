'use strict';
const express = require('express');
const { validate } = require('../middleware/validate');
const {
  markCommissionPaidSchema,
  commissionReasonSchema,
  updatePayoutMethodSchema,
} = require('../lib/schemas');

const WELCOME_BONUS_CAD = 100;

/**
 * createAdminAffiliatesRouter({ db, resend, escapeHtml, getUncachableStripeClient, adminMiddleware, APP_URL })
 *
 * All /api/admin/affiliates/* routes: CRUD, Stripe Connect onboarding,
 * payout transfers, CSV export, and monthly summary generation.
 */
module.exports = function createAdminAffiliatesRouter({
  db, resend, escapeHtml, getUncachableStripeClient, adminMiddleware, APP_URL,
}) {
  const router = express.Router();

  router.get('/api/admin/affiliates', adminMiddleware, async (req, res, next) => {
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
    } catch (e) { console.error('Admin affiliates error:', e.message); next(Object.assign(e, { publicMessage: 'Server error' })); }
  });

  router.post('/api/admin/affiliates/:id/approve', adminMiddleware, async (req, res, next) => {
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
    } catch (e) { console.error('Affiliate approve error:', e.message); next(Object.assign(e, { publicMessage: 'Server error' })); }
  });

  router.post('/api/admin/affiliates/:id/reject', adminMiddleware, async (req, res, next) => {
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
    } catch (e) { console.error('Affiliate reject error:', e.message); next(Object.assign(e, { publicMessage: 'Server error' })); }
  });

  router.post('/api/admin/affiliates/commissions/:id/mark-paid', adminMiddleware, express.json(), validate(markCommissionPaidSchema), async (req, res, next) => {
    const commId = parseInt(req.params.id);
    const { payment_ref, payout_method, payout_amount, override_pending } = req.body;
    if (!commId) return res.status(400).json({ error: 'Invalid commission ID' });
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
    } catch (e) { console.error('Mark paid error:', e.message); next(Object.assign(e, { publicMessage: 'Server error' })); }
  });

  router.post('/api/admin/affiliates/commissions/:id/block', adminMiddleware, express.json(), validate(commissionReasonSchema), async (req, res, next) => {
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
    } catch (e) { console.error('Block commission error:', e.message); next(Object.assign(e, { publicMessage: 'Server error' })); }
  });

  router.post('/api/admin/affiliates/commissions/:id/reverse', adminMiddleware, express.json(), validate(commissionReasonSchema), async (req, res, next) => {
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
    } catch (e) { console.error('Reverse commission error:', e.message); next(Object.assign(e, { publicMessage: 'Server error' })); }
  });

  router.get('/api/admin/affiliates/payout-summary', adminMiddleware, async (req, res, next) => {
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
    } catch (e) { console.error('Payout summary error:', e.message); next(Object.assign(e, { publicMessage: 'Server error' })); }
  });

  // ── Stripe Connect ──────────────────────────────────────────────────────
  router.post('/api/admin/affiliates/:id/stripe-connect/initiate', adminMiddleware, async (req, res, next) => {
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
    } catch (e) { console.error('Stripe Connect initiate error:', e.message); next(Object.assign(e, { publicMessage: e.message })); }
  });

  router.get('/api/admin/affiliates/:id/stripe-connect/link', adminMiddleware, async (req, res, next) => {
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
    } catch (e) { console.error('Connect link error:', e.message); next(Object.assign(e, { publicMessage: e.message })); }
  });

  router.post('/api/admin/affiliates/:id/stripe-connect/sync', adminMiddleware, async (req, res, next) => {
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
    } catch (e) { console.error('Connect sync error:', e.message); next(Object.assign(e, { publicMessage: e.message })); }
  });

  router.post('/api/admin/affiliates/:id/payout', adminMiddleware, express.json(), async (req, res, next) => {
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
    } catch (e) { console.error('Payout transfer error:', e.message); next(Object.assign(e, { publicMessage: e.message })); }
  });

  router.post('/api/admin/affiliates/:id/update-payout-method', adminMiddleware, express.json(), validate(updatePayoutMethodSchema), async (req, res, next) => {
    const affId = parseInt(req.params.id);
    const { pref_payout_method } = req.body;
    if (!affId) return res.status(400).json({ error: 'Invalid id' });
    try {
      await db.query(`UPDATE influencers SET pref_payout_method = $1 WHERE id = $2`, [(pref_payout_method || '').trim() || null, affId]);
      res.json({ success: true });
    } catch (e) { next(Object.assign(e, { publicMessage: 'Server error' })); }
  });

  router.get('/api/admin/affiliates/export-csv', adminMiddleware, async (req, res, next) => {
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
    } catch (e) { console.error('Affiliate export error:', e.message); next(Object.assign(e, { publicMessage: 'Server error' })); }
  });

  router.post('/api/admin/affiliates/generate-monthly-summaries', adminMiddleware, async (req, res, next) => {
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
    } catch (e) { console.error('Generate summaries error:', e.message); next(Object.assign(e, { publicMessage: 'Server error' })); }
  });

  return router;
};
