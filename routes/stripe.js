/**
 * Stripe routes
 *
 * Handles all payment-related endpoints:
 *   POST /api/stripe/webhook          — Stripe event ingestion (uses express.raw, NOT express.json)
 *   GET  /api/stripe/publishable-key  — Returns the Stripe publishable key for the frontend
 *   POST /api/payments/create-checkout — Create a Stripe Checkout session
 *   GET  /api/payments/cancel          — Cancel redirect back to /pricing
 *   POST /api/payments/billing-portal  — Open the Stripe Customer Portal
 *   GET  /api/payments/status          — Return the caller's current subscription tier
 *
 * Mounted in server.js BEFORE express.json() so the webhook can receive the raw body.
 *
 * Factory export — call with shared deps that are still defined in server.js:
 *   const createStripeRouter = require('./routes/stripe');
 *   app.use('/api', createStripeRouter({ resend, authMiddleware,
 *     processReferralCredit, processInfluencerCommission, escapeHtml, highestPlan }));
 *
 * NOTE: Admin Stripe Connect routes (/api/admin/affiliates/:id/stripe-connect/*)
 * are NOT included here — they belong with routes/admin.js.
 */

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { validate } = require('../middleware/validate');
const { checkoutSchema } = require('../lib/schemas');
const {
  getUncachableStripeClient,
  getStripePublishableKey,
  getStripeSync,
} = require('../stripeClient');

// Declared at module level so the webhook handler can reset it on success.
// Read by the admin dashboard health check (still in server.js) via the site_settings table.
let lastWebhookSigFailure = null;

// ── Workbook purchase handler ─────────────────────────────────────────────────
// NOTE: This function was referenced but never defined in the original server.js.
// Implemented here from the workbook_purchases table schema.
async function handleWorkbookPurchase(session) {
  const email = session.customer_details?.email || session.customer_email;
  const downloadToken = crypto.randomBytes(32).toString('hex');
  await db.query(
    `INSERT INTO workbook_purchases (stripe_session_id, customer_email, download_token, purchased_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (stripe_session_id) DO NOTHING`,
    [session.id, email, downloadToken]
  );
  console.log(`Workbook purchase recorded — session ${session.id}, email ${email}`);
}

// ── Plan helpers ──────────────────────────────────────────────────────────────
const PLAN_TIER_ORDER = [
  'free', 'premium_monthly', 'premium', 'starter_team', 'pro_team', 'enterprise',
];

// ── Price ID map (read from env at request time so hot-reloads work) ──────────
function getPriceMap() {
  return {
    premium_monthly:     process.env.STRIPE_PREMIUM_MONTHLY_ID     || '',
    premium_annual:      process.env.STRIPE_PREMIUM_ANNUAL_ID      || '',
    starter_team:        process.env.STRIPE_STARTER_TEAM_ID        || '',
    pro_team:            process.env.STRIPE_PRO_TEAM_ID            || '',
    starter_team_annual: process.env.STRIPE_STARTER_TEAM_ANNUAL_ID || '',
    pro_team_annual:     process.env.STRIPE_PRO_TEAM_ANNUAL_ID     || '',
  };
}

// ── Router factory ────────────────────────────────────────────────────────────
module.exports = function createStripeRouter({
  resend,
  authMiddleware,
  processReferralCredit,
  processInfluencerCommission,
  escapeHtml,
  highestPlan,
}) {
  const router = express.Router();

  // ── Webhook ─────────────────────────────────────────────────────────────────
  // MUST use express.raw — Stripe signature verification requires the raw body.
  // This route must be mounted BEFORE app.use(express.json()) in server.js.
  router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) return res.status(400).json({ error: 'Missing stripe-signature' });
    const sig = Array.isArray(signature) ? signature[0] : signature;

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    // Replit-managed integration path (dev only — no explicit webhook secret)
    if (!webhookSecret && process.env.REPLIT_DOMAINS) {
      try {
        const sync = await getStripeSync();
        await sync.processWebhook(req.body, sig);
        try {
          const rawEvent = JSON.parse(req.body.toString());
          if (rawEvent.type === 'checkout.session.completed') {
            const session = rawEvent.data?.object;
            if (
              session &&
              (session.payment_status === 'paid' || session.status === 'complete') &&
              session.customer
            ) {
              const payingUser = await db.query(
                'SELECT id, email FROM users WHERE stripe_customer_id = $1',
                [session.customer]
              );
              if (payingUser.rows.length > 0) {
                await processReferralCredit(payingUser.rows[0].email, payingUser.rows[0].id);
              }
            }
          }
        } catch (refErr) {
          console.error('Replit webhook referral check error:', refErr.message);
        }
        return res.status(200).json({ received: true });
      } catch (err) {
        console.error('Webhook error (Replit):', err.message);
        return res.status(400).json({ error: 'Webhook processing error' });
      }
    }

    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not set');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    // Verify signature
    let event;
    try {
      const stripe = await getUncachableStripeClient();
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      const failedAt = new Date().toISOString();
      lastWebhookSigFailure = { at: failedAt, message: err.message };
      db.query(
        `INSERT INTO site_settings (key, value, updated_at) VALUES ('webhook_sig_failure', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify({ at: failedAt, message: err.message })]
      ).catch(e => console.error('Failed to persist webhook sig failure:', e.message));
      console.warn(JSON.stringify({
        level: 'WARN',
        event: 'stripe_webhook_sig_failure',
        message:
          'Webhook signature verification failed — this is often caused by a rotated ' +
          'STRIPE_WEBHOOK_SECRET that has not been updated in Replit Secrets.',
        stripe_error: err.message,
        timestamp: failedAt,
      }));
      return res.status(400).json({ error: 'Invalid signature' });
    }

    lastWebhookSigFailure = null;

    // Process event
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;

          // Workbook one-time purchase
          if (session.metadata?.type === 'workbook') {
            if (
              session.payment_status === 'paid' ||
              session.payment_status === 'no_payment_required'
            ) {
              await handleWorkbookPurchase(session).catch(e =>
                console.error('Workbook purchase handler error:', e.message)
              );
            }
            break;
          }

          // Subscription checkout
          if (session.payment_status === 'paid' || session.status === 'complete') {
            const customerId = session.customer;
            const plan = session.metadata?.plan || 'premium';
            const isTeamPlan =
              plan === 'starter_team' ||
              plan === 'pro_team' ||
              plan === 'starter_team_annual' ||
              plan === 'pro_team_annual';

            if (isTeamPlan && session.metadata?.restaurantId) {
              await db.query('UPDATE restaurants SET plan = $1 WHERE id = $2', [
                plan,
                parseInt(session.metadata.restaurantId),
              ]);
              await db.query(
                'UPDATE users SET stripe_subscription_id = $1 WHERE stripe_customer_id = $2',
                [session.subscription, customerId]
              );
            } else {
              const normalizedPlan =
                plan === 'premium_annual' || plan === 'premium_monthly' ? 'premium' : plan;
              await db.query(
                'UPDATE users SET subscription_status = $1, stripe_subscription_id = $2 WHERE stripe_customer_id = $3',
                [normalizedPlan, session.subscription, customerId]
              );
            }

            const payingUser = await db.query(
              'SELECT id, email, influencer_ref_code FROM users WHERE stripe_customer_id = $1',
              [customerId]
            );
            if (payingUser.rows.length > 0) {
              await processReferralCredit(payingUser.rows[0].email, payingUser.rows[0].id);
              await processInfluencerCommission(payingUser.rows[0], plan).catch(e =>
                console.error('Influencer commission error:', e.message)
              );
            }
          }
          break;
        }

        case 'customer.subscription.updated': {
          const sub = event.data.object;
          if (sub.status === 'active') {
            await db.query(
              'UPDATE users SET subscription_status = $1 WHERE stripe_subscription_id = $2',
              ['premium', sub.id]
            );
          } else if (sub.status === 'canceled' || sub.status === 'unpaid') {
            await db.query(
              'UPDATE users SET subscription_status = $1 WHERE stripe_subscription_id = $2',
              ['free', sub.id]
            );
            await db.query(
              `UPDATE restaurants SET plan = 'free'
               WHERE (SELECT stripe_subscription_id FROM users WHERE users.restaurant_id = restaurants.id LIMIT 1) = $1`,
              [sub.id]
            );
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          await db.query(
            'UPDATE users SET subscription_status = $1, stripe_subscription_id = NULL WHERE stripe_subscription_id = $2',
            ['free', sub.id]
          );
          await db.query(
            `UPDATE restaurants SET plan = 'free'
             WHERE (SELECT stripe_subscription_id FROM users WHERE users.restaurant_id = restaurants.id LIMIT 1) = $1`,
            [sub.id]
          );
          break;
        }

        case 'charge.refunded': {
          const charge = event.data.object;
          if (charge.customer) {
            const refundedUser = await db.query(
              'SELECT id FROM users WHERE stripe_customer_id = $1',
              [charge.customer]
            );
            if (refundedUser.rows.length) {
              const userId = refundedUser.rows[0].id;
              await db.query(
                `UPDATE influencer_commissions
                 SET status = 'blocked', blocked_reason = 'refund_detected'
                 WHERE user_id = $1 AND status IN ('pending', 'payout_ready')`,
                [userId]
              ).catch(e => console.error('Commission block on refund error:', e.message));
              console.log(`Commission blocked for user ${userId} due to charge refund (${charge.id})`);
            }
          }
          break;
        }

        case 'account.updated': {
          const acct = event.data.object;
          if (acct.id) {
            const payoutsEnabled = acct.payouts_enabled === true;
            const onboardStatus = acct.details_submitted
              ? acct.payouts_enabled
                ? 'complete'
                : 'restricted'
              : 'link_sent';
            await db.query(
              `UPDATE influencers
               SET stripe_payouts_enabled = $1, stripe_onboard_status = $2
               WHERE stripe_connect_id = $3`,
              [payoutsEnabled, onboardStatus, acct.id]
            ).catch(e => console.error('account.updated sync error:', e.message));
          }
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          console.warn('Payment failed for customer:', invoice.customer);
          try {
            const failedUser = await db.query(
              'SELECT email, name FROM users WHERE stripe_customer_id = $1',
              [invoice.customer]
            );
            if (failedUser.rows.length > 0) {
              const u = failedUser.rows[0];
              resend.emails.send({
                from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
                to: u.email,
                subject: 'Action required — payment issue with your ServeMaster Academy subscription',
                html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
                  <p style="font-size:16px;line-height:1.7;">Hi ${u.name},</p>
                  <p style="font-size:16px;line-height:1.7;">We were unable to process your most recent payment for ServeMaster Academy. Please update your payment method to keep your account active.</p>
                  <p style="margin:32px 0;"><a href="https://servemasteracademy.ca/app" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Update Payment Method →</a></p>
                  <p style="font-size:15px;color:#a3a3a3;">If you need help, reply to this email.<br><strong style="color:#f5f5f5;">Kirk</strong><br><a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#d4af37;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a></p>
                </div>`,
              }).catch(e => console.error('Payment failed email error:', e.message));
            }
          } catch (e) {
            console.error('Payment failed handler error:', e.message);
          }
          break;
        }

        default:
          break;
      }

      db.query(`DELETE FROM site_settings WHERE key = 'webhook_sig_failure'`)
        .catch(e => console.error('Failed to clear webhook sig failure:', e.message));
      res.status(200).json({ received: true });
    } catch (err) {
      console.error('Webhook handler error:', err.message);
      next(Object.assign(err, { publicMessage: 'Webhook handler failed' }));
    }
  });

  // ── Publishable key ──────────────────────────────────────────────────────────
  router.get('/stripe/publishable-key', async (req, res, next) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (err) {
      next(Object.assign(err, { publicMessage: 'Unable to fetch key' }));
    }
  });

  // ── Create checkout session ──────────────────────────────────────────────────
  router.post('/payments/create-checkout', authMiddleware, express.json(), validate(checkoutSchema), async (req, res, next) => {
    const { plan } = req.body;
    const priceMap = getPriceMap();
    const priceId = priceMap[plan];
    if (!priceId) return res.status(400).json({ error: 'Invalid plan' });

    const isTeamPlan = ['starter_team', 'pro_team', 'starter_team_annual', 'pro_team_annual'].includes(plan);

    try {
      const userRes = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
      const user = userRes.rows[0];

      if (isTeamPlan && user.role !== 'manager' && user.role !== 'admin') {
        return res.status(403).json({
          error: 'Team plans require a Manager account. Create a restaurant first.',
        });
      }

      const stripe = await getUncachableStripeClient();
      let customerId = user.stripe_customer_id;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: String(user.id) },
        });
        customerId = customer.id;
        await db.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [
          customerId,
          user.id,
        ]);

        // Apply any deferred referral credits accumulated before this user had a Stripe account
        const pendingCredits = await db.query(
          "SELECT id FROM referrals WHERE referrer_user_id = $1 AND status = 'pending_credit'",
          [user.id]
        );
        const deferredClient = await db.pool.connect();
        for (const pc of pendingCredits.rows) {
          try {
            await deferredClient.query('BEGIN');
            await stripe.customers.createBalanceTransaction(
              customerId,
              { amount: -5000, currency: 'cad', description: 'Referral credit — thank you for inviting a manager!' },
              { idempotencyKey: `referral-credit-${pc.id}` }
            );
            await deferredClient.query(
              'UPDATE referrals SET status = $1, credited_at = NOW() WHERE id = $2',
              ['credited', pc.id]
            );
            await deferredClient.query('COMMIT');
            resend.emails.send({
              from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
              to: user.email,
              subject: 'Your $50 referral credit has been applied!',
              html: `
                <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
                  <img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;">
                  <h2 style="font-size:22px;margin-bottom:16px;color:#fbbf24;">Your $50 credit is live!</h2>
                  <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(user.name)},</p>
                  <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">A <strong style="color:#34d399;">$50 CAD credit</strong> from your referral has been applied to your new account. It will automatically reduce your first bill.</p>
                  <p style="font-size:15px;line-height:1.7;color:#a3a3a3;">Warm regards,<br><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy</p>
                </div>
              `,
            }).catch(err => console.error('Deferred referral email error:', err.message));
            resend.emails.send({
              from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
              to: 'kirk_adamson@servemasteracademy.ca',
              subject: `Deferred referral credit issued: $50 to ${user.name}`,
              html: `<p>Deferred referral credit of <strong>$50 CAD</strong> applied to <strong>${escapeHtml(user.name)}</strong> (${escapeHtml(user.email)}) at checkout time.</p>`,
            }).catch(err => console.error('Admin deferred referral notification error:', err.message));
          } catch (creditErr) {
            await deferredClient.query('ROLLBACK').catch(() => {});
            console.error('Deferred credit apply error:', creditErr.message);
          }
        }
        deferredClient.release();
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const metadata = { plan, userId: String(user.id) };
      if (isTeamPlan && user.restaurant_id) metadata.restaurantId = String(user.restaurant_id);

      const sessionParams = {
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        metadata,
        success_url: 'https://servemasteracademy.ca/success.html',
        cancel_url: 'https://servemasteracademy.ca',
      };

      let session;
      try {
        session = await stripe.checkout.sessions.create(sessionParams);
      } catch (sessionErr) {
        // Customer record missing in Stripe (deleted externally) — recreate and retry
        if (sessionErr.code === 'resource_missing' && sessionErr.param === 'customer') {
          const freshCustomer = await stripe.customers.create({
            email: user.email,
            metadata: { userId: String(user.id) },
          });
          await db.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [
            freshCustomer.id,
            user.id,
          ]);
          sessionParams.customer = freshCustomer.id;
          session = await stripe.checkout.sessions.create(sessionParams);
        } else {
          throw sessionErr;
        }
      }

      res.json({ url: session.url });
    } catch (err) {
      console.error('Checkout error:', err.message);
      next(Object.assign(err, { publicMessage: 'Failed to create checkout session' }));
    }
  });

  // ── Cancel redirect ──────────────────────────────────────────────────────────
  router.get('/payments/cancel', (req, res) => res.redirect('/pricing'));

  // ── Billing portal ───────────────────────────────────────────────────────────
  router.post('/payments/billing-portal', authMiddleware, async (req, res, next) => {
    try {
      const result = await db.query(
        'SELECT stripe_customer_id FROM users WHERE id = $1',
        [req.user.id]
      );
      let customerId = result.rows[0]?.stripe_customer_id;
      if (!customerId) {
        return res.status(400).json({ error: 'No billing account found. You may be on a free plan.' });
      }

      const stripe = await getUncachableStripeClient();
      try {
        await stripe.customers.retrieve(customerId);
      } catch (custErr) {
        if (custErr.code === 'resource_missing') {
          const freshCustomer = await stripe.customers.create({
            email: req.user.email,
            metadata: { userId: String(req.user.id) },
          });
          await db.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [
            freshCustomer.id,
            req.user.id,
          ]);
          customerId = freshCustomer.id;
        } else {
          throw custErr;
        }
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: 'https://servemasteracademy.ca/app',
      });
      res.json({ url: session.url });
    } catch (err) {
      console.error('Billing portal error:', err.message);
      next(Object.assign(err, { publicMessage: 'Failed to open billing portal' }));
    }
  });

  // ── Payment status ────────────────────────────────────────────────────────────
  router.get('/payments/status', authMiddleware, async (req, res, next) => {
    try {
      const result = await db.query(
        'SELECT subscription_status, restaurant_id FROM users WHERE id = $1',
        [req.user.id]
      );
      const user = result.rows[0];
      let restaurantPlan = 'free';
      if (user?.restaurant_id) {
        const rRes = await db.query('SELECT plan FROM restaurants WHERE id = $1', [user.restaurant_id]);
        restaurantPlan = rRes.rows[0]?.plan || 'free';
      }
      const effective_plan = highestPlan(user?.subscription_status, restaurantPlan);
      res.json({ status: user?.subscription_status || 'free', effective_plan });
    } catch (err) {
      next(Object.assign(err, { publicMessage: 'Failed to check subscription' }));
    }
  });

  return router;
};
