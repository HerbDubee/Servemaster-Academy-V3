const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai').default;
const { toFile } = require('openai');
const { getUncachableStripeClient, getStripePublishableKey, getStripeSync } = require('./stripeClient');
const { Resend } = require('resend');
const db = require('./db');

const resend = new Resend(process.env.RESEND_API_KEY);

const authLimiter     = rateLimit({ windowMs: 15 * 60 * 1000, max: 10,  standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Please try again in 15 minutes.' } });
const aiLimiter       = rateLimit({ windowMs: 15 * 60 * 1000, max: 30,  standardHeaders: true, legacyHeaders: false, message: { error: 'Too many AI requests. Please slow down.' } });
const contactLimiter  = rateLimit({ windowMs: 60 * 60 * 1000, max: 5,   standardHeaders: true, legacyHeaders: false, message: { error: 'Too many submissions. Please try again later.' } });
const progressLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many progress updates. Please slow down.' } });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'video/webm'];
    cb(null, allowed.includes(file.mimetype));
  }
});

const compression = require('compression');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());
app.use(cookieParser());
// Force JS files to revalidate on every load so browser updates are never missed
app.use(function (req, res, next) {
  if (req.path.endsWith('.js')) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  }
  next();
});
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(path.join(__dirname, 'public')));

if (!process.env.JWT_SECRET) throw new Error('FATAL: JWT_SECRET env var is not set. Server cannot start securely.');
const JWT_SECRET = process.env.JWT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

const STRIPE_PREMIUM_MONTHLY_ID = process.env.STRIPE_PREMIUM_MONTHLY_ID || '';
const STRIPE_PREMIUM_ANNUAL_ID = process.env.STRIPE_PREMIUM_ANNUAL_ID || '';
const STRIPE_STARTER_TEAM_ID = process.env.STRIPE_STARTER_TEAM_ID || '';
const STRIPE_PRO_TEAM_ID = process.env.STRIPE_PRO_TEAM_ID || '';
const STRIPE_STARTER_TEAM_ANNUAL_ID = process.env.STRIPE_STARTER_TEAM_ANNUAL_ID || '';
const STRIPE_PRO_TEAM_ANNUAL_ID = process.env.STRIPE_PRO_TEAM_ANNUAL_ID || '';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const HELLO_EMAIL = process.env.HELLO_EMAIL || '';

const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE_OPTS = { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax', secure: IS_PROD };

const PLAN_TIER_ORDER = ['free', 'premium_monthly', 'premium', 'starter_team', 'pro_team', 'enterprise'];
const PAID_PLAN_STATUSES = new Set(['premium_monthly', 'premium', 'starter_team', 'pro_team', 'enterprise', 'active']);
function highestPlan(a, b) {
  const ai = PLAN_TIER_ORDER.indexOf(a || 'free');
  const bi = PLAN_TIER_ORDER.indexOf(b || 'free');
  return ai >= bi ? (a || 'free') : (b || 'free');
}

let _openai = null;
function getOpenAI() {
  if (_openai) return _openai;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('No OpenAI API key configured. Set OPENAI_API_KEY.');
  _openai = new OpenAI({ apiKey, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined });
  return _openai;
}

let _whisper = null;
function getWhisper() {
  if (_whisper) return _whisper;
  // Whisper must use standard OpenAI API — Azure does not have Whisper deployed.
  // Skip any dummy/placeholder key so the real integration key is used.
  const direct = process.env.OPENAI_API_KEY;
  const apiKey = (direct && !direct.startsWith('_DUMMY_') ? direct : null)
    || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) throw new Error('No OpenAI API key configured. Set OPENAI_API_KEY.');
  _whisper = new OpenAI({ apiKey });
  return _whisper;
}

let _tts = null;
function getTTS() {
  if (_tts) return _tts;
  // OpenAI TTS must use the standard OpenAI API — Azure does not expose the TTS endpoint.
  // Skip any dummy/placeholder key so the real integration key is used.
  const directTts = process.env.OPENAI_API_KEY;
  const apiKey = (directTts && !directTts.startsWith('_DUMMY_') ? directTts : null)
    || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) throw new Error('No OpenAI API key configured. Set OPENAI_API_KEY.');
  _tts = new OpenAI({ apiKey });
  return _tts;
}

let _grok = null;
function getGrok() {
  if (_grok) return _grok;
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('No xAI API key configured. Set XAI_API_KEY.');
  _grok = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1' });
  return _grok;
}

// ── Referral credit helper ───────────────────────────────────────────────────
async function processReferralCredit(payingUserEmail, payingUserId) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const alreadyCredited = await client.query(
      `SELECT 1 FROM referrals WHERE referred_user_id = $1 AND status = 'credited' LIMIT 1`,
      [payingUserId]
    );
    if (alreadyCredited.rows.length > 0) { await client.query('ROLLBACK'); return; }
    const ref = await client.query(
      `SELECT r.id, r.referrer_user_id, u.stripe_customer_id, u.email AS referrer_email, u.name AS referrer_name
       FROM referrals r JOIN users u ON u.id = r.referrer_user_id
       WHERE r.referred_email = $1 AND r.referred_user_id = $2 AND r.status = 'pending'
       ORDER BY r.created_at ASC LIMIT 1 FOR UPDATE OF r SKIP LOCKED`,
      [payingUserEmail.toLowerCase(), payingUserId]
    );
    if (ref.rows.length === 0) { await client.query('ROLLBACK'); return; }
    const { id: refId, stripe_customer_id, referrer_email, referrer_name } = ref.rows[0];
    if (stripe_customer_id) {
      const stripe = await getUncachableStripeClient();
      await stripe.customers.createBalanceTransaction(stripe_customer_id, {
        amount: -5000,
        currency: 'cad',
        description: 'Referral credit — thank you for inviting a manager!'
      }, { idempotencyKey: `referral-credit-${refId}` });
      await client.query('UPDATE referrals SET status = $1, credited_at = NOW() WHERE id = $2', ['credited', refId]);
      await client.query("UPDATE referrals SET status = 'closed' WHERE referred_user_id = $1 AND status = 'pending' AND id != $2", [payingUserId, refId]);
      await client.query('COMMIT');
      resend.emails.send({
        from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
        to: referrer_email,
        subject: 'Your $50 referral credit has been applied!',
        html: `
          <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
            <img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;">
            <h2 style="font-size:22px;margin-bottom:16px;color:#fbbf24;">Your $50 credit is live!</h2>
            <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(referrer_name)},</p>
            <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Great news — the manager you referred (<strong>${escapeHtml(payingUserEmail)}</strong>) just subscribed. A <strong style="color:#34d399;">$50 CAD credit</strong> has been applied to your account and will automatically reduce your next bill.</p>
            <p style="font-size:16px;line-height:1.7;margin-bottom:24px;">Thank you for spreading the word!</p>
            <p style="font-size:15px;line-height:1.7;color:#a3a3a3;">Warm regards,<br>
            <strong style="color:#f5f5f5;">Kirk Adamson</strong><br>
            Founder, ServeMaster Academy</p>
          </div>
        `
      }).catch(err => console.error('Referral credit email error:', err.message));
      resend.emails.send({
        from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
        to: 'kirk_adamson@servemasteracademy.ca',
        subject: `Referral credit issued: $50 to ${referrer_name}`,
        html: `<p>Referral credit of <strong>$50 CAD</strong> applied to <strong>${escapeHtml(referrer_name)}</strong> (${escapeHtml(referrer_email)}) — referred manager ${escapeHtml(payingUserEmail)} subscribed.</p>`
      }).catch(err => console.error('Admin referral notification error:', err.message));
    } else {
      await client.query('UPDATE referrals SET status = $1 WHERE id = $2', ['pending_credit', refId]);
      await client.query("UPDATE referrals SET status = 'closed' WHERE referred_user_id = $1 AND status = 'pending' AND id != $2", [payingUserId, refId]);
      await client.query('COMMIT');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Referral credit processing error:', err.message);
  } finally {
    client.release();
  }
}

// ── Stripe webhook (must be BEFORE express.json) ──────────────────────────────
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  if (!signature) return res.status(400).json({ error: 'Missing stripe-signature' });
  const sig = Array.isArray(signature) ? signature[0] : signature;

  // If an explicit webhook secret is set (required in production / custom domain),
  // verify directly with it.  Only fall back to the Replit-managed integration when
  // no explicit secret is configured (local dev via Replit workspace).
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret && process.env.REPLIT_DOMAINS) {
    try {
      const sync = await getStripeSync();
      await sync.processWebhook(req.body, sig);
      try {
        const rawEvent = JSON.parse(req.body.toString());
        if (rawEvent.type === 'checkout.session.completed') {
          const session = rawEvent.data?.object;
          if (session && (session.payment_status === 'paid' || session.status === 'complete') && session.customer) {
            const payingUser = await db.query('SELECT id, email FROM users WHERE stripe_customer_id = $1', [session.customer]);
            if (payingUser.rows.length > 0) await processReferralCredit(payingUser.rows[0].email, payingUser.rows[0].id);
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

  let event;
  try {
    const stripe = await getUncachableStripeClient();
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.payment_status === 'paid' || session.status === 'complete') {
          const customerId = session.customer;
          const plan = session.metadata?.plan || 'premium';
          const isTeamPlan = plan === 'starter_team' || plan === 'pro_team';
          if (isTeamPlan && session.metadata?.restaurantId) {
            await db.query('UPDATE restaurants SET plan = $1 WHERE id = $2', [plan, parseInt(session.metadata.restaurantId)]);
            await db.query('UPDATE users SET stripe_subscription_id = $1 WHERE stripe_customer_id = $2', [session.subscription, customerId]);
          } else {
            await db.query(
              'UPDATE users SET subscription_status = $1, stripe_subscription_id = $2 WHERE stripe_customer_id = $3',
              [(plan === 'premium_annual' || plan === 'premium_monthly') ? 'premium' : plan, session.subscription, customerId]
            );
          }
          const payingUser = await db.query('SELECT id, email FROM users WHERE stripe_customer_id = $1', [customerId]);
          if (payingUser.rows.length > 0) {
            await processReferralCredit(payingUser.rows[0].email, payingUser.rows[0].id);
          }
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        if (sub.status === 'active') {
          await db.query('UPDATE users SET subscription_status = $1 WHERE stripe_subscription_id = $2', ['premium', sub.id]);
        } else if (sub.status === 'canceled' || sub.status === 'unpaid') {
          await db.query('UPDATE users SET subscription_status = $1 WHERE stripe_subscription_id = $2', ['free', sub.id]);
          await db.query("UPDATE restaurants SET plan = 'free' WHERE (SELECT stripe_subscription_id FROM users WHERE users.restaurant_id = restaurants.id LIMIT 1) = $1", [sub.id]);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await db.query('UPDATE users SET subscription_status = $1, stripe_subscription_id = NULL WHERE stripe_subscription_id = $2', ['free', sub.id]);
        await db.query("UPDATE restaurants SET plan = 'free' WHERE (SELECT stripe_subscription_id FROM users WHERE users.restaurant_id = restaurants.id LIMIT 1) = $1", [sub.id]);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.warn('Payment failed for customer:', invoice.customer);
        try {
          const failedUser = await db.query('SELECT email, name FROM users WHERE stripe_customer_id = $1', [invoice.customer]);
          if (failedUser.rows.length > 0) {
            const u = failedUser.rows[0];
            resend.emails.send({
              from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
              to: u.email,
              subject: 'Action required — payment issue with your ServeMaster Academy subscription',
              html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><p style="font-size:16px;line-height:1.7;">Hi ${u.name},</p><p style="font-size:16px;line-height:1.7;">We were unable to process your most recent payment for ServeMaster Academy. Please update your payment method to keep your account active.</p><p style="margin:32px 0;"><a href="https://servemasteracademy.ca/app" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Update Payment Method →</a></p><p style="font-size:15px;color:#a3a3a3;">If you need help, reply to this email.<br><strong style="color:#f5f5f5;">Kirk</strong><br><a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#d4af37;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a></p></div>`
            }).catch(e => console.error('Payment failed email error:', e.message));
          }
        } catch (e) { console.error('Payment failed handler error:', e.message); }
        break;
      }
    }
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err.message);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// ── Auth middleware ────────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

async function adminMiddleware(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization || '').replace('Bearer ', '');
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

async function checkTrial(req, res, next) {
  try {
    const { rows } = await db.query(
      'SELECT subscription_status, trial_ends_at, is_trial_active, invite_access_expires_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows.length) return res.status(401).json({ error: 'User not found' });
    const user = rows[0];
    const now = new Date();

    // Time-limited invite access: check before the paid-plan pass-through so that
    // an expired invite code trial correctly reverts even if subscription_status is 'premium'.
    if (user.invite_access_expires_at) {
      if (now > new Date(user.invite_access_expires_at)) {
        await db.query(
          "UPDATE users SET subscription_status = 'none', invite_access_expires_at = NULL WHERE id = $1",
          [req.user.id]
        );
        return res.status(402).json({
          error: 'Trial expired',
          message: 'Your complimentary access period has ended. Please subscribe to continue.'
        });
      }
      // Still within the invite window — allow through
      return next();
    }

    if (PAID_PLAN_STATUSES.has(user.subscription_status)) return next();

    const trialEnd = user.trial_ends_at ? new Date(user.trial_ends_at) : null;

    if (trialEnd && now <= trialEnd) return next();

    if (user.is_trial_active) {
      await db.query('UPDATE users SET is_trial_active = false WHERE id = $1', [req.user.id]);
    }

    return res.status(402).json({
      error: 'Trial expired',
      message: 'Your 14-day trial has ended. Please upgrade to continue.'
    });
  } catch (err) {
    console.error('checkTrial error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

function optionalAuth(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (token) { try { req.user = jwt.verify(token, JWT_SECRET); } catch {} }
  next();
}

// ── Page routes ───────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'home.html')));
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'public', 'about.html')));
app.get('/features', (req, res) => res.sendFile(path.join(__dirname, 'public', 'features.html')));
app.get('/pricing', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pricing.html')));
app.get('/managers', (req, res) => res.sendFile(path.join(__dirname, 'public', 'managers.html')));
app.get('/ai-roleplay', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ai-roleplay.html')));
app.get('/manager-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'manager-dashboard.html')));
app.get('/blog', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog', 'index.html')));
app.get('/knowledge-centre', (req, res) => res.redirect(301, '/blog'));
app.get('/knowledge-center', (req, res) => res.redirect(301, '/blog'));
app.get('/blog/:slug', (req, res, next) => {
  const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
  const filePath = path.join(__dirname, 'public', 'blog', slug + '.html');
  res.sendFile(filePath, (err) => {
    if (err) {
      const templatePath = path.join(__dirname, 'public', 'blog', 'article.html');
      res.sendFile(templatePath, (err2) => { if (err2) next(); });
    }
  });
});
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'public', 'contact.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/trial-started', (req, res) => res.sendFile(path.join(__dirname, 'public', 'trial-started.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'public', 'terms.html')));
app.get('/brand', (req, res) => res.sendFile(path.join(__dirname, 'public', 'brand.html')));
app.get('/forgot-password', (req, res) => res.sendFile(path.join(__dirname, 'public', 'forgot-password.html')));
app.get('/reset-password', (req, res) => res.sendFile(path.join(__dirname, 'public', 'reset-password.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'app.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.get('/api/stripe/publishable-key', async (req, res) => {
  try {
    const key = await getStripePublishableKey();
    res.json({ publishableKey: key });
  } catch {
    res.status(500).json({ error: 'Unable to fetch key' });
  }
});

app.get('/api/admin/bootstrap', (req, res) => {
  res.status(410).json({ error: 'This endpoint has been disabled. Use /admin to grant access.' });
});

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post('/api/auth/register', authLimiter, async (req, res) => {
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
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('token', token, COOKIE_OPTS);
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, token, message: 'Account created – 14-day trial started!' });
    (async () => { try {
      const unsubToken = await getOrCreateUnsubToken(user.id);
      const unsubUrl = `https://servemasteracademy.ca/unsubscribe?token=${unsubToken}`;
      resend.emails.send({
        from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
        to: user.email,
        subject: 'Welcome to ServeMaster Academy – Your 14-day trial starts now',
        html: `
          <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
            <img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;">
            <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(user.name)},</p>
            <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">I'm Kirk Adamson, founder of ServeMaster Academy.</p>
            <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Thank you for starting your free trial. I created this platform because I believe every guest deserves to feel truly cared for — and every server deserves the tools to make that happen.</p>
            <p style="font-size:16px;line-height:1.7;margin-bottom:32px;">Your 14-day journey begins now. I recommend starting with Module 1: Foundations of Exceptional Service.</p>
            <p style="margin-bottom:32px;">
              <a href="https://servemasteracademy.ca/app" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Start Module 1 Now</a>
            </p>
            <p style="font-size:16px;line-height:1.7;margin-bottom:24px;">I'd love to hear what you think after your first session.</p>
            <p style="font-size:15px;line-height:1.7;color:#a3a3a3;">Warm regards,<br>
            <strong style="color:#f5f5f5;">Kirk Adamson</strong><br>
            Founder, ServeMaster Academy<br>
            <a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#d4af37;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a></p>
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

app.post('/api/auth/login', authLimiter, async (req, res) => {
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

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

app.post('/api/forgot-password', authLimiter, async (req, res) => {
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
      const resetLink = `https://servemasteracademy.ca/reset-password?token=${token}`;
      await resend.emails.send({
        from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
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

app.post('/api/reset-password', authLimiter, async (req, res) => {
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

app.get('/api/auth/me', authMiddleware, async (req, res) => {
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

app.get('/api/auth/google', authLimiter, (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.redirect('/login?error=google_not_configured');
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

app.get('/api/auth/google/callback', async (req, res) => {
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
        const unsubToken = await getOrCreateUnsubToken(user.id);
        const unsubUrl = `https://servemasteracademy.ca/unsubscribe?token=${unsubToken}`;
        resend.emails.send({
          from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
          to: user.email,
          subject: 'Welcome to ServeMaster Academy – Your 14-day trial starts now',
          html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(user.name)},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">I'm Kirk Adamson, founder of ServeMaster Academy.</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Thank you for starting your free trial. I created this platform because I believe every guest deserves to feel truly cared for — and every server deserves the tools to make that happen.</p><p style="font-size:16px;line-height:1.7;margin-bottom:32px;">Your 14-day journey begins now. I recommend starting with Module 1: Foundations of Exceptional Service.</p><p style="margin-bottom:32px;"><a href="https://servemasteracademy.ca/app" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Start Module 1 Now</a></p><p style="font-size:16px;line-height:1.7;margin-bottom:24px;">I'd love to hear what you think after your first session.</p><p style="font-size:15px;line-height:1.7;color:#a3a3a3;">Warm regards,<br><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy<br><a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#d4af37;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a></p>${emailFooter(unsubUrl)}</div>`
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

// ── Shared email helpers ──────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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

// ── Unsubscribe helpers ──────────────────────────────────────────────────────
const crypto = require('crypto');
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

// ── Email drip sequence ──────────────────────────────────────────────────────
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
      { day: 7, subject: 'One week in — 7 days left on your trial', html: wrap(`<p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(userName)},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Servers who complete at least 5 modules in their first two weeks are <strong>3× more likely</strong> to earn their certificate.</p><p style="font-size:16px;line-height:1.7;margin-bottom:24px;">You have 7 days left in your free trial. Your free access stays forever (3 modules, 5 scenarios), but the remaining 27 modules, all 36 scenarios, voice practice, and your certificate unlock with Premium.</p>${cta('Continue Training →', 'https://servemasteracademy.ca/app')}<p style="margin-bottom:32px;"><a href="https://servemasteracademy.ca/pricing" style="color:#d4af37;font-size:14px;">See Premium pricing →</a></p>${sig}`) },
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

// ── Weekly manager digest ────────────────────────────────────────────────────
async function sendWeeklyManagerDigests() {
  try {
    const managers = await db.query(`SELECT u.id, u.name, u.email, r.id as restaurant_id, r.name as restaurant_name FROM users u JOIN restaurants r ON r.manager_id = u.id WHERE u.is_unsubscribed IS NOT TRUE AND u.subscription_status NOT IN ('free') ORDER BY u.id`);
    let sent = 0;
    for (const mgr of managers.rows) {
      const team = await db.query(`SELECT u.name, COALESCE(up_agg.modules_done,0) as modules, COALESCE(up_agg.avg_score,0) as avg_score FROM restaurant_members rm JOIN users u ON u.id = rm.user_id LEFT JOIN (SELECT user_id, COUNT(*) FILTER (WHERE progress>=100) as modules_done, AVG(quiz_score) FILTER (WHERE quiz_score IS NOT NULL) as avg_score FROM user_progress GROUP BY user_id) up_agg ON up_agg.user_id = rm.user_id WHERE rm.restaurant_id = $1 ORDER BY modules DESC LIMIT 10`, [mgr.restaurant_id]);
      if (!team.rows.length) continue;
      const unsubToken = await getOrCreateUnsubToken(mgr.id);
      const unsubUrl = `https://servemasteracademy.ca/unsubscribe?token=${unsubToken}`;
      const rows = team.rows.map(s => `<tr><td style="padding:8px 12px;border-bottom:1px solid #222;">${escapeHtml(s.name)}</td><td style="padding:8px 12px;border-bottom:1px solid #222;text-align:center;">${s.modules}/30</td><td style="padding:8px 12px;border-bottom:1px solid #222;text-align:center;">${s.avg_score ? Math.round(s.avg_score)+'%' : '—'}</td></tr>`).join('');
      resend.emails.send({
        from: 'ServeMaster Academy <kirk_adamson@servemasteracademy.ca>',
        to: mgr.email,
        subject: `Weekly Training Digest — ${mgr.restaurant_name}`,
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><h2 style="font-size:20px;color:#d4af37;margin-bottom:4px;">Weekly Team Digest</h2><p style="font-size:14px;color:#a3a3a3;margin-bottom:24px;">${escapeHtml(mgr.restaurant_name)} · Week of ${new Date().toLocaleDateString('en-CA',{month:'long',day:'numeric',year:'numeric'})}</p><table style="width:100%;border-collapse:collapse;font-size:14px;"><thead><tr style="background:#1a1a1a;"><th style="padding:8px 12px;text-align:left;color:#a3a3a3;">Staff Member</th><th style="padding:8px 12px;text-align:center;color:#a3a3a3;">Modules</th><th style="padding:8px 12px;text-align:center;color:#a3a3a3;">Avg Quiz</th></tr></thead><tbody>${rows}</tbody></table><p style="margin-top:24px;"><a href="https://servemasteracademy.ca/manager-dashboard" style="background:#d4af37;color:#000;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px;">View Full Dashboard →</a></p>${emailFooter(unsubUrl)}</div>`
      }).catch(e => console.error('Weekly digest error:', e.message));
      sent++;
    }
    return sent;
  } catch (e) { console.error('Weekly digest error:', e.message); return 0; }
}

async function updateStreak(userId) {
  try {
    const streakRes = await db.query('SELECT * FROM streaks WHERE user_id = $1', [userId]);
    const today = new Date().toISOString().split('T')[0];
    if (!streakRes.rows.length) {
      await db.query('INSERT INTO streaks (user_id, current_streak, longest_streak, last_activity_date) VALUES ($1, 1, 1, $2)', [userId, today]);
      return;
    }
    const s = streakRes.rows[0];
    const last = s.last_activity_date ? new Date(s.last_activity_date).toISOString().split('T')[0] : null;
    if (last === today) return;
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const prevStreak = s.current_streak;
    const newStreak = last === yesterday ? s.current_streak + 1 : 1;
    const longest = Math.max(newStreak, s.longest_streak);
    await db.query('UPDATE streaks SET current_streak = $1, longest_streak = $2, last_activity_date = $3 WHERE user_id = $4', [newStreak, longest, today, userId]);
    if (newStreak === 1 && prevStreak >= 3) {
      const userRes = await db.query('SELECT email, name, is_unsubscribed FROM users WHERE id = $1', [userId]);
      if (userRes.rows.length && !userRes.rows[0].is_unsubscribed) {
        const { email, name } = userRes.rows[0];
        const unsubToken = await getOrCreateUnsubToken(userId);
        const unsubUrl = `https://servemasteracademy.ca/unsubscribe?token=${unsubToken}`;
        resend.emails.send({
          from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
          to: email,
          subject: `Don't lose your ${prevStreak}-day streak 🔥`,
          html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><h2 style="font-size:22px;color:#fb923c;margin-bottom:12px;">Your ${prevStreak}-day streak broke 🔥</h2><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(name)},</p><p style="font-size:16px;line-height:1.7;margin-bottom:24px;">You missed a day and your streak reset. But here's the thing — the servers who build lasting careers aren't the ones who never miss a day. They're the ones who come back after they do.</p><p style="margin-bottom:32px;"><a href="https://servemasteracademy.ca/app" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Start a New Streak Today →</a></p><p style="font-size:14px;color:#a3a3a3;">— Kirk Adamson, Founder</p>${emailFooter(unsubUrl)}</div>`
        }).catch(e => console.error('Streak recovery email error:', e.message));
      }
    }
  } catch (err) { console.error('Streak update error:', err.message); }
}

app.get('/api/user/progress', authMiddleware, checkTrial, async (req, res) => {
  try {
    const result = await db.query('SELECT module_id, progress, quiz_score, completed_at FROM user_progress WHERE user_id = $1', [req.user.id]);
    const streakRes = await db.query('SELECT current_streak, longest_streak FROM streaks WHERE user_id = $1', [req.user.id]);
    const badgeRes = await db.query('SELECT badge_id, earned_at FROM badges WHERE user_id = $1', [req.user.id]);
    const scenarioRes = await db.query('SELECT scenario_id, completed_at FROM scenario_scores WHERE user_id = $1 ORDER BY completed_at DESC', [req.user.id]);
    const subRes = await db.query('SELECT subscription_status FROM users WHERE id = $1', [req.user.id]);
    res.json({
      progress: result.rows,
      streak: streakRes.rows[0] || { current_streak: 0, longest_streak: 0 },
      badges: badgeRes.rows,
      scenarios: scenarioRes.rows,
      subscription_status: subRes.rows[0]?.subscription_status || 'free'
    });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch progress' }); }
});

app.post('/api/user/progress', authMiddleware, progressLimiter, checkTrial, async (req, res) => {
  let { moduleId, progress, quizScore } = req.body;
  if (!moduleId) return res.status(400).json({ error: 'moduleId required' });
  try {
    const userRes = await db.query('SELECT stripe_subscription_id, subscription_status FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];
    if (user?.stripe_subscription_id) {
      try {
        const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
        if (subscription.status !== 'active' && subscription.trial_end && subscription.trial_end < Date.now() / 1000) {
          return res.status(402).json({ error: 'Trial expired', redirect: '/pricing' });
        }
      } catch (stripeErr) {
        console.warn('Stripe subscription check failed:', stripeErr.message);
      }
    }
    if (quizScore > 0) progress = 100;
    const completed = progress >= 100 ? new Date() : null;
    const prevRes = await db.query(
      'SELECT completed_at FROM user_progress WHERE user_id = $1 AND module_id = $2',
      [req.user.id, moduleId]
    );
    const wasAlreadyComplete = prevRes.rows[0]?.completed_at != null;
    await db.query(`
      INSERT INTO user_progress (user_id, module_id, progress, quiz_score, completed_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, module_id)
      DO UPDATE SET progress = GREATEST(user_progress.progress, $3),
        quiz_score = GREATEST(user_progress.quiz_score, COALESCE($4, 0)),
        completed_at = COALESCE(user_progress.completed_at, $5),
        updated_at = NOW()
    `, [req.user.id, moduleId, progress, quizScore || 0, completed]);
    await updateStreak(req.user.id);
    await checkAndAwardBadges(req.user.id);
    res.json({ success: true });
    if (moduleId === 2 && progress >= 100 && !wasAlreadyComplete) {
      const uRes = await db.query('SELECT name, email FROM users WHERE id = $1', [req.user.id]);
      const u = uRes.rows[0];
      if (u) {
        (async () => { try {
          const unsubToken = await getOrCreateUnsubToken(req.user.id);
          const unsubUrl = `https://servemasteracademy.ca/unsubscribe?token=${unsubToken}`;
          resend.emails.send({
            from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
            to: u.email,
            subject: 'Have you tried the AI role-play yet?',
            html: `
              <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
                <img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;">
                <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${u.name},</p>
                <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">One of the most powerful features in ServeMaster Academy is the AI role-play.</p>
                <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">You speak your response to a real guest scenario (anniversary table, difficult customer, VIP) and get instant coaching.</p>
                <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">It feels surprisingly real — and it's the fastest way to build confidence.</p>
                <p style="font-size:16px;line-height:1.7;margin-bottom:32px;">Try one scenario today — it only takes 2 minutes.</p>
                <p style="margin-bottom:32px;">
                  <a href="https://servemasteracademy.ca/app" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Open AI Role-Play Now</a>
                </p>
                <p style="font-size:15px;line-height:1.7;color:#a3a3a3;">
                  <strong style="color:#f5f5f5;">Kirk</strong><br>
                  <a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#d4af37;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a>
                </p>
                ${emailFooter(unsubUrl)}
              </div>
            `
          }).catch(err => console.error('AI roleplay email error:', err.message));
        } catch(e) {} })();
      }
    }
    if (moduleId === 1 && progress >= 100 && !wasAlreadyComplete) {
      const uRes = await db.query('SELECT name, email FROM users WHERE id = $1', [req.user.id]);
      const u = uRes.rows[0];
      if (u) {
        (async () => { try {
          const unsubToken = await getOrCreateUnsubToken(req.user.id);
          const unsubUrl = `https://servemasteracademy.ca/unsubscribe?token=${unsubToken}`;
          resend.emails.send({
            from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
            to: u.email,
            subject: 'Module 1 complete — here\'s what\'s next',
            html: `
              <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
                <img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;">
                <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${u.name},</p>
                <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">After countless years enjoying fine dining, I've learned that the entire dining experience is often decided in the first 30 seconds.</p>
                <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">The way a server greets the table, handles coats, and makes the guest feel seen — that single moment sets the tone for the whole evening.</p>
                <p style="font-size:16px;line-height:1.7;margin-bottom:32px;">Module 2 teaches exactly how to master that moment. Would you like to try it now?</p>
                <p style="margin-bottom:32px;">
                  <a href="https://servemasteracademy.ca/app" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Continue to Module 2 →</a>
                </p>
                <p style="font-size:16px;line-height:1.7;margin-bottom:24px;">Looking forward to hearing how it goes,</p>
                <p style="font-size:15px;line-height:1.7;color:#a3a3a3;">
                  <strong style="color:#f5f5f5;">Kirk</strong><br>
                  <a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#d4af37;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a>
                </p>
                ${emailFooter(unsubUrl)}
              </div>
            `
          }).catch(err => console.error('Module 1 email error:', err.message));
        } catch(e) {} })();
      }
    }
  } catch (err) { res.status(500).json({ error: 'Failed to save progress' }); }
});

app.get('/api/modules', authMiddleware, checkTrial, async (req, res) => {
  const ALL_MODULES = [
    { id:1,  title:'Foundations of Exceptional Service',          titleFr:"Fondements du service d'exception",             titleEs:'Fundamentos del Servicio Excepcional',       emoji:'🌟', mins:10 },
    { id:2,  title:'Seating, Menus & Taking Orders',             titleFr:'Placement, menus & prise de commandes',          titleEs:'Acomodar, Menús y Tomar Pedidos',            emoji:'📋', mins:10 },
    { id:3,  title:'Beverage Mastery: Wine & Cocktail Service',  titleFr:'Maîtrise des boissons : vins & cocktails',       titleEs:'Dominio de Bebidas: Vino y Cócteles',        emoji:'🍸', mins:12 },
    { id:4,  title:'Wine Pairing & Advanced Beverage Knowledge', titleFr:'Accords mets-vins & connaissances avancées',     titleEs:'Maridaje de Vinos y Conocimiento Avanzado',  emoji:'🥂', mins:12 },
    { id:5,  title:'Natural & Effective Upselling',              titleFr:'Vente additionnelle naturelle & efficace',        titleEs:'Venta Sugestiva Natural y Efectiva',         emoji:'💰', mins:10 },
    { id:6,  title:'Food Service & Perfect Pacing',              titleFr:'Service des plats & rythme parfait',             titleEs:'Servicio de Alimentos y Ritmo Perfecto',     emoji:'🍽️', mins:10 },
    { id:7,  title:'Table Maintenance & Problem Resolution',     titleFr:"Entretien des tables & résolution de problèmes", titleEs:'Mantenimiento de Mesas y Resolución de Problemas', emoji:'🧼', mins:10 },
    { id:8,  title:'International Etiquette',                    titleFr:'Étiquette internationale',                       titleEs:'Etiqueta Internacional',                     emoji:'🌍', mins:8  },
    { id:9,  title:'Special Occasions Mastery',                  titleFr:'Maîtrise des occasions spéciales',               titleEs:'Dominio de Ocasiones Especiales',            emoji:'🎂', mins:10 },
    { id:10, title:'Closing the Experience',                     titleFr:"Clore l'expérience",                             titleEs:'Cerrar la Experiencia',                      emoji:'👋', mins:8  },
    { id:11, title:'Advanced Wine Regions',                      titleFr:'Régions viticoles avancées',                     titleEs:'Regiones Vitivinícolas Avanzadas',           emoji:'🌎', mins:12 },
    { id:12, title:'Server Leadership & Career',                 titleFr:'Leadership & carrière en service',               titleEs:'Liderazgo del Mesero y Carrera Profesional', emoji:'⭐', mins:10 },
    { id:13, title:'Spirits, Cocktails & Bar Knowledge',          titleFr:'Spiritueux, cocktails & savoir du bar',          titleEs:'Licores, Cócteles y Conocimiento del Bar',   emoji:'🥃', mins:12 },
    { id:14, title:'Coffee & Non-Alcoholic Beverage Service',     titleFr:'Café & service des boissons non alcoolisées',    titleEs:'Café y Servicio de Bebidas No Alcohólicas',  emoji:'☕', mins:10 },
    { id:15, title:'Allergens, Dietary Needs & Safe Service',     titleFr:'Allergènes, besoins alimentaires & service sûr', titleEs:'Alérgenos, Necesidades Dietéticas y Servicio Seguro', emoji:'⚠️', mins:12 },
    { id:16, title:'Reading Guests & Emotional Intelligence',     titleFr:'Lire les clients & intelligence émotionnelle',   titleEs:'Lectura de Clientes e Inteligencia Emocional', emoji:'🧠', mins:10 },
    { id:17, title:'Menu Knowledge & Ingredient Confidence',      titleFr:'Connaissance du menu & confiance en ingrédients',titleEs:'Conocimiento del Menú y Confianza en Ingredientes', emoji:'🌿', mins:10 },
    { id:18, title:'Managing the Rush',                           titleFr:'Gérer le coup de feu',                           titleEs:'Gestionar la Hora Punta',                    emoji:'⚡', mins:10 },
    { id:19, title:'Host Skills: Reservations, Phone & Greeting', titleFr:'Compétences d\'hôte : réservations, téléphone & accueil', titleEs:'Habilidades de Anfitrión: Reservas, Teléfono y Bienvenida', emoji:'📞', mins:10 },
    { id:20, title:'Cheese, Charcuterie & Tableside Specialities',titleFr:'Fromage, charcuterie & spécialités en salle',    titleEs:'Quesos, Charcutería y Especialidades en Mesa', emoji:'🧀', mins:10 },
    { id:21, title:'Sustainability & Responsible Hospitality',    titleFr:'Durabilité & hospitalité responsable',           titleEs:'Sostenibilidad y Hospitalidad Responsable',  emoji:'🌱', mins:10 },
    { id:22, title:'Digital Tools & Modern Restaurant Tech',      titleFr:'Outils numériques & technologie moderne',        titleEs:'Herramientas Digitales y Tecnología Moderna', emoji:'💻', mins:8  },
    { id:23, title:'Team Culture & Kitchen Communication',        titleFr:'Culture d\'équipe & communication en cuisine',   titleEs:'Cultura de Equipo y Comunicación con Cocina', emoji:'🤝', mins:10 },
    { id:24, title:'Wellness, Resilience & Long-Term Career',     titleFr:'Bien-être, résilience & carrière à long terme',  titleEs:'Bienestar, Resiliencia y Carrera a Largo Plazo', emoji:'🌟', mins:10 },
    { id:25, title:'Bar Setup & Mise en Place',                   titleFr:'Mise en place du bar',                           titleEs:'Preparación y Mise en Place del Bar',            emoji:'🧊', mins:12 },
    { id:26, title:'Essential Bartending Techniques',             titleFr:'Techniques essentielles du barman',              titleEs:'Técnicas Esenciales de Bartending',              emoji:'🍹', mins:12 },
    { id:27, title:'Classic Cocktails & Drink Building',          titleFr:'Cocktails classiques & construction de boissons',titleEs:'Cócteles Clásicos y Construcción de Bebidas',    emoji:'🥃', mins:14 },
    { id:28, title:'Bar Upselling & Guest Engagement',            titleFr:'Vente additionnelle & engagement client au bar', titleEs:'Venta Sugestiva y Compromiso con el Cliente',    emoji:'💰', mins:12 },
    { id:29, title:'Responsible Service & Difficult Situations',  titleFr:'Service responsable & situations difficiles',    titleEs:'Servicio Responsable y Situaciones Difíciles',   emoji:'🚫', mins:12 },
    { id:30, title:'Bar Career & Culture',                        titleFr:'Carrière & culture du bar',                      titleEs:'Carrera y Cultura del Bar',                      emoji:'🌟', mins:10 }
  ];
  try {
    const { rows } = await db.query(
      'SELECT module_id, progress, quiz_score, completed_at FROM user_progress WHERE user_id = $1',
      [req.user.id]
    );
    const progressMap = {};
    rows.forEach(r => { progressMap[r.module_id] = { progress: r.progress, quizScore: r.quiz_score, completedAt: r.completed_at }; });
    const modules = ALL_MODULES.map(m => ({
      ...m,
      progress: progressMap[m.id]?.progress ?? 0,
      quizScore: progressMap[m.id]?.quizScore ?? null,
      completedAt: progressMap[m.id]?.completedAt ?? null
    }));
    res.json({ modules });
  } catch (err) {
    console.error('Modules fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch modules' });
  }
});

app.post('/api/user/scenario', authMiddleware, checkTrial, async (req, res) => {
  const { scenarioId } = req.body;
  if (!scenarioId) return res.status(400).json({ error: 'scenarioId required' });
  try {
    await db.query('INSERT INTO scenario_scores (user_id, scenario_id) VALUES ($1, $2)', [req.user.id, scenarioId]);
    await checkAndAwardBadges(req.user.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to save scenario' }); }
});

async function checkAndAwardBadges(userId) {
  try {
    const progressRes = await db.query('SELECT * FROM user_progress WHERE user_id = $1', [userId]);
    const scenarioRes = await db.query('SELECT COUNT(*) as cnt FROM scenario_scores WHERE user_id = $1', [userId]);
    const streakRes = await db.query('SELECT * FROM streaks WHERE user_id = $1', [userId]);
    const progress = progressRes.rows;
    const scenarioCount = parseInt(scenarioRes.rows[0]?.cnt || 0);
    const streak = streakRes.rows[0];
    const completedModules = progress.filter(p => p.progress >= 100).length;
    const potentialBadges = [];
    if (completedModules >= 1) potentialBadges.push('first_module');
    if (completedModules >= 30) potentialBadges.push('module_master');
    if (scenarioCount >= 1) potentialBadges.push('first_scenario');
    if (scenarioCount >= 10) potentialBadges.push('scenario_ace');
    if (scenarioCount >= 20) potentialBadges.push('scenario_legend');
    if (streak && streak.current_streak >= 7) potentialBadges.push('week_warrior');
    if (streak && streak.current_streak >= 30) potentialBadges.push('month_master');
    const bevMods = [3, 4, 11].every(id => progress.find(p => p.module_id === id && p.progress >= 100));
    if (bevMods) potentialBadges.push('wine_expert');
    const allPerfect = progress.filter(p => p.quiz_score >= 100).length >= 5;
    if (allPerfect) potentialBadges.push('perfect_scorer');
    for (const badgeId of potentialBadges) {
      await db.query('INSERT INTO badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, badgeId]);
    }
  } catch (err) { console.error('Badge check error:', err.message); }
}

app.get('/api/leaderboard', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.name,
        COALESCE(SUM(p.progress), 0) as total_progress,
        COUNT(CASE WHEN p.progress >= 100 THEN 1 END) as modules_completed,
        COALESCE(s.current_streak, 0) as streak,
        (SELECT COUNT(*) FROM scenario_scores ss WHERE ss.user_id = u.id) as scenarios_done
      FROM users u
      LEFT JOIN user_progress p ON p.user_id = u.id
      LEFT JOIN streaks s ON s.user_id = u.id
      GROUP BY u.id, u.name, s.current_streak
      ORDER BY total_progress DESC, modules_completed DESC
      LIMIT 50
    `);
    res.json({ leaderboard: result.rows });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch leaderboard' }); }
});

app.post('/api/newsletter/subscribe', contactLimiter, async (req, res) => {
  const { email, firstName } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    await db.query('INSERT INTO email_subscribers (email, first_name) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET active = TRUE', [email.toLowerCase(), firstName || '']);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Subscription failed' }); }
});

app.post('/api/contact', contactLimiter, async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'All fields required' });
  try {
    await db.query('INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3)', [name, email.toLowerCase(), message]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to send message' }); }
});

app.post('/api/request-team-trial', contactLimiter, async (req, res) => {
  const { name, email, restaurantName } = req.body;
  if (!name || !email || !restaurantName) return res.status(400).json({ error: 'Name, email and restaurant name are required' });
  try {
    await db.query('INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3)', [name, email.toLowerCase(), `[TEAM TRIAL REQUEST] Restaurant: ${restaurantName}`]);
    resend.emails.send({
      from: 'ServeMaster Academy <kirk_adamson@servemasteracademy.ca>',
      to: 'kirk_adamson@servemasteracademy.ca',
      subject: `Starter Team Trial Request — ${restaurantName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:32px;border-radius:12px;">
        <h2 style="color:#7dd3fc;margin-top:0;">New Starter Team Trial Request</h2>
        <table style="font-size:15px;width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#a1a1aa;width:140px;">Name</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(name)}</td></tr>
          <tr><td style="padding:8px 0;color:#a1a1aa;">Email</td><td style="padding:8px 0;"><a href="mailto:${escapeHtml(email)}" style="color:#7dd3fc;">${escapeHtml(email)}</a></td></tr>
          <tr><td style="padding:8px 0;color:#a1a1aa;">Restaurant</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(restaurantName)}</td></tr>
        </table>
        <p style="margin-top:24px;font-size:14px;color:#71717a;">Received via the homepage team trial request form.</p>
      </div>`
    }).catch(e => console.error('Team trial request email error:', e.message));
    res.json({ success: true });
  } catch (err) {
    console.error('Team trial request error:', err.message);
    res.status(500).json({ error: 'Failed to send request' });
  }
});

app.post('/api/enterprise-request', contactLimiter, async (req, res) => {
  const { name, email, company, locations, message } = req.body;
  if (!name || !email || !company) return res.status(400).json({ error: 'Name, email and company are required' });
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
    res.status(500).json({ error: 'Failed to send request' });
  }
});

// ── Referral – invite a manager ───────────────────────────────────────────────
app.post('/api/referral/invite-manager', authMiddleware, contactLimiter, async (req, res) => {
  const { managerEmail, note } = req.body;
  if (!managerEmail) return res.status(400).json({ error: 'Manager email is required' });
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
    res.status(500).json({ error: 'Failed to send invite' });
  }
});

// ── Manager routes ────────────────────────────────────────────────────────────
app.post('/api/manager/create-restaurant', authMiddleware, async (req, res) => {
  const { restaurantName } = req.body;
  if (!restaurantName) return res.status(400).json({ error: 'Restaurant name required' });
  try {
    const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    const result = await db.query('INSERT INTO restaurants (name, owner_id, invite_code) VALUES ($1, $2, $3) RETURNING *', [restaurantName, req.user.id, inviteCode]);
    const restaurant = result.rows[0];
    await db.query("UPDATE users SET role = 'manager', restaurant_id = $1 WHERE id = $2", [restaurant.id, req.user.id]);
    res.json({ restaurant, inviteCode });
  } catch (err) { res.status(500).json({ error: 'Failed to create restaurant' }); }
});

app.post('/api/manager/join', authMiddleware, async (req, res) => {
  const { inviteCode } = req.body;
  if (!inviteCode) return res.status(400).json({ error: 'Invite code required' });
  try {
    const result = await db.query('SELECT * FROM restaurants WHERE invite_code = $1', [inviteCode.toUpperCase()]);
    if (!result.rows.length) return res.status(404).json({ error: 'Invalid invite code' });
    const restaurant = result.rows[0];
    await db.query('UPDATE users SET restaurant_id = $1 WHERE id = $2', [restaurant.id, req.user.id]);
    res.json({ success: true, restaurantName: restaurant.name });
  } catch (err) { res.status(500).json({ error: 'Failed to join restaurant' }); }
});

app.get('/api/manager/dashboard', authMiddleware, async (req, res) => {
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
  } catch (err) { res.status(500).json({ error: 'Failed to fetch dashboard' }); }
});


// ── Stripe payment routes ─────────────────────────────────────────────────────
app.post('/api/payments/create-checkout', authMiddleware, async (req, res) => {
  const { plan } = req.body;
  const priceMap = {
    premium_monthly:       STRIPE_PREMIUM_MONTHLY_ID,
    premium_annual:        STRIPE_PREMIUM_ANNUAL_ID,
    starter_team:          STRIPE_STARTER_TEAM_ID,
    pro_team:              STRIPE_PRO_TEAM_ID,
    starter_team_annual:   STRIPE_STARTER_TEAM_ANNUAL_ID,
    pro_team_annual:       STRIPE_PRO_TEAM_ANNUAL_ID,
  };
  const priceId = priceMap[plan];
  if (!priceId) return res.status(400).json({ error: 'Invalid plan' });
  const isTeamPlan = ['starter_team','pro_team','starter_team_annual','pro_team_annual'].includes(plan);
  try {
    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];
    if (isTeamPlan && user.role !== 'manager' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Team plans require a Manager account. Create a restaurant first.' });
    }
    const stripe = await getUncachableStripeClient();
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { userId: String(user.id) } });
      customerId = customer.id;
      await db.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, user.id]);
      const pendingCredits = await db.query(
        "SELECT id FROM referrals WHERE referrer_user_id = $1 AND status = 'pending_credit'",
        [user.id]
      );
      const deferredClient = await db.pool.connect();
      for (const pc of pendingCredits.rows) {
        try {
          await deferredClient.query('BEGIN');
          await stripe.customers.createBalanceTransaction(customerId, {
            amount: -5000, currency: 'cad',
            description: 'Referral credit — thank you for inviting a manager!'
          }, { idempotencyKey: `referral-credit-${pc.id}` });
          await deferredClient.query('UPDATE referrals SET status = $1, credited_at = NOW() WHERE id = $2', ['credited', pc.id]);
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
            `
          }).catch(err => console.error('Deferred referral email error:', err.message));
          resend.emails.send({
            from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
            to: 'kirk_adamson@servemasteracademy.ca',
            subject: `Deferred referral credit issued: $50 to ${user.name}`,
            html: `<p>Deferred referral credit of <strong>$50 CAD</strong> applied to <strong>${escapeHtml(user.name)}</strong> (${escapeHtml(user.email)}) at checkout time.</p>`
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
      if (sessionErr.code === 'resource_missing' && sessionErr.param === 'customer') {
        const freshCustomer = await stripe.customers.create({ email: user.email, metadata: { userId: String(user.id) } });
        await db.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [freshCustomer.id, user.id]);
        sessionParams.customer = freshCustomer.id;
        session = await stripe.checkout.sessions.create(sessionParams);
      } else {
        throw sessionErr;
      }
    }
    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

app.get('/api/payments/cancel', (req, res) => res.redirect('/pricing'));

app.post('/api/payments/billing-portal', authMiddleware, async (req, res) => {
  try {
    const result = await db.query('SELECT stripe_customer_id FROM users WHERE id = $1', [req.user.id]);
    let customerId = result.rows[0]?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ error: 'No billing account found. You may be on a free plan.' });
    const stripe = await getUncachableStripeClient();
    try {
      await stripe.customers.retrieve(customerId);
    } catch (custErr) {
      if (custErr.code === 'resource_missing') {
        const freshCustomer = await stripe.customers.create({ email: req.user.email, metadata: { userId: String(req.user.id) } });
        await db.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [freshCustomer.id, req.user.id]);
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
    res.status(500).json({ error: 'Failed to open billing portal' });
  }
});

app.get('/api/payments/status', authMiddleware, async (req, res) => {
  try {
    const result = await db.query('SELECT subscription_status, restaurant_id FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    let restaurantPlan = 'free';
    if (user?.restaurant_id) {
      const rRes = await db.query('SELECT plan FROM restaurants WHERE id = $1', [user.restaurant_id]);
      restaurantPlan = rRes.rows[0]?.plan || 'free';
    }
    const effective_plan = highestPlan(user?.subscription_status, restaurantPlan);
    res.json({ status: user?.subscription_status || 'free', effective_plan });
  } catch (err) { res.status(500).json({ error: 'Failed to check subscription' }); }
});

// ── Admin routes ──────────────────────────────────────────────────────────────
app.get('/api/admin/overview', adminMiddleware, async (req, res) => {
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
      total_users: parseInt(users.rows[0].cnt),
      new_users_7d: parseInt(new7d.rows[0].cnt),
      new_users_30d: parseInt(new30d.rows[0].cnt),
      active_users_7d: parseInt(active7d.rows[0].cnt),
      free_users: byTier['free'] || 0,
      premium_subscribers: byTier['premium'] || 0,
      starter_team_locations: byTeam['starter_team'] || 0,
      pro_team_locations: byTeam['pro_team'] || 0,
      enterprise_accounts: byTier['enterprise'] || 0,
      newsletter_subs: parseInt(subs.rows[0].cnt),
      scenarios_completed: parseInt(scenarios.rows[0].cnt),
      modules_completed: parseInt(modules.rows[0].cnt),
      contact_messages: parseInt(contacts.rows[0].cnt),
    });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch overview' }); }
});

app.get('/api/admin/users', adminMiddleware, async (req, res) => {
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

app.patch('/api/admin/users/:id', adminMiddleware, async (req, res) => {
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

app.delete('/api/admin/users/:id', adminMiddleware, async (req, res) => {
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

// Welcome-back email blast for migrated V2 users
app.post('/api/admin/send-welcome-back', adminMiddleware, async (req, res) => {
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

app.get('/api/admin/modules', adminMiddleware, async (req, res) => {
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

app.get('/api/admin/newsletter', adminMiddleware, async (req, res) => {
  try {
    const result = await db.query('SELECT email, first_name, created_at FROM email_subscribers WHERE active = TRUE ORDER BY created_at DESC');
    res.json({ subscribers: result.rows });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch newsletter' }); }
});

app.get('/api/admin/restaurants', adminMiddleware, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT r.id, r.name, r.invite_code, r.created_at, u.name as owner_name, u.email as owner_email,
        (SELECT COUNT(*) FROM users m WHERE m.restaurant_id = r.id) as staff_count
      FROM restaurants r JOIN users u ON u.id = r.owner_id ORDER BY r.created_at DESC
    `);
    res.json({ restaurants: result.rows });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch restaurants' }); }
});

app.get('/api/admin/contacts', adminMiddleware, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100');
    res.json({ messages: result.rows });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch contacts' }); }
});

// ── Invite code admin routes ──────────────────────────────────────────────────
app.post('/api/admin/invite-codes', adminMiddleware, async (req, res) => {
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

app.get('/api/admin/invite-codes', adminMiddleware, async (req, res) => {
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

const TOTAL_MODULES = 30;
const TOTAL_SCENARIOS = 36;

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
      // Always delete & re-insert progress for a clean, reliable state
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

async function seedAdminProgress() {
  try {
    const existing = await db.query('SELECT id, password_hash FROM users WHERE email = $1', [ADMIN_EMAIL]);
    if (!existing.rows.length) return;
    // If a placeholder demo account was created, remove it so the real admin can register
    if (existing.rows[0].password_hash && existing.rows[0].password_hash.startsWith('$2b$10$demoplaceholder')) {
      await db.query('DELETE FROM users WHERE id = $1', [existing.rows[0].id]);
      console.log(`Removed placeholder admin account for ${ADMIN_EMAIL} — please sign up at /signup`);
      return;
    }
    const userId = existing.rows[0].id;
    await db.query('DELETE FROM user_progress WHERE user_id = $1', [userId]);
    for (let m = 1; m <= TOTAL_MODULES; m++) {
      await db.query(
        `INSERT INTO user_progress (user_id, module_id, progress, completed_at)
         VALUES ($1, $2, 100, NOW())
         ON CONFLICT (user_id, module_id) DO UPDATE SET progress = 100, completed_at = NOW()`,
        [userId, m]
      );
    }
    await db.query(
      `INSERT INTO streaks (user_id, current_streak, longest_streak, last_activity_date)
       VALUES ($1, 90, 90, CURRENT_DATE)
       ON CONFLICT (user_id) DO UPDATE SET current_streak = 90, longest_streak = GREATEST(streaks.longest_streak, 90), last_activity_date = CURRENT_DATE`,
      [userId]
    );
    await db.query('DELETE FROM scenario_scores WHERE user_id = $1', [userId]);
    for (let sc = 1; sc <= TOTAL_SCENARIOS; sc++) {
      await db.query(`INSERT INTO scenario_scores (user_id, scenario_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, sc]);
    }
    console.log(`Admin progress seeded for ${ADMIN_EMAIL}: ${TOTAL_MODULES} modules, ${TOTAL_SCENARIOS} scenarios`);
  } catch (err) {
    console.warn('Admin progress seed warning (non-fatal):', err.message);
  }
}

app.post('/api/admin/seed-fake-users', adminMiddleware, async (req, res) => {
  try {
    const result = await seedDemoUsers();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/invite-codes/:code', adminMiddleware, async (req, res) => {
  const validPlans = ['free', 'premium', 'starter_team', 'pro_team', 'enterprise'];
  const { plan } = req.body;
  if (!plan || !validPlans.includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
  try {
    const r = await db.query('UPDATE invite_codes SET plan = $1 WHERE code = $2 RETURNING code', [plan, req.params.code]);
    if (!r.rows.length) return res.status(404).json({ error: 'Code not found' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed to update invite code' }); }
});

app.delete('/api/admin/invite-codes/:code', adminMiddleware, async (req, res) => {
  try {
    await db.query('DELETE FROM invite_codes WHERE code = $1', [req.params.code]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete invite code' }); }
});

app.post('/api/admin/send-email', adminMiddleware, async (req, res) => {
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
        subject: 'Module 1 complete — here\'s what\'s next',
        html: emailShell(`${p(`Hi ${name},`)}${p("After countless years enjoying fine dining, I've learned that the entire dining experience is often decided in the first 30 seconds.")}${p("The way a server greets the table, handles coats, and makes the guest feel seen — that single moment sets the tone for the whole evening.")}${p("Module 2 teaches exactly how to master that moment. Would you like to try it now?")}${btn("Continue to Module 2 →", "https://servemasteracademy.ca/app")}${p("Looking forward to hearing how it goes,")}${sig}`)
      },
      roleplay: {
        subject: 'Have you tried the AI role-play yet?',
        html: emailShell(`${p(`Hi ${name},`)}${p("One of the most powerful features in ServeMaster Academy is the AI role-play.")}${p("You speak your response to a real guest scenario (anniversary table, difficult customer, VIP) and get instant coaching.")}${p("It feels surprisingly real — and it's the fastest way to build confidence.")}${p("Try one scenario today — it only takes 2 minutes.")}${btn("Open AI Role-Play Now", "https://servemasteracademy.ca/app")}${sig}`)
      },
      day7: {
        subject: 'You\'re halfway through your trial — here\'s what to try next',
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

// ── Invite code redeem (user) ─────────────────────────────────────────────────
app.post('/api/invite/redeem', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code required' });
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
  } catch (err) { res.status(500).json({ error: 'Failed to redeem invite code' }); }
});

// ── AI routes ─────────────────────────────────────────────────────────────────
app.post('/api/tts', aiLimiter, async (req, res) => {
  const { text, lang } = req.body;
  if (!text || typeof text !== 'string') return res.status(400).json({ error: 'Missing text' });
  const trimmed = text.trim();
  if (!trimmed) return res.status(400).json({ error: 'Empty text' });
  if (trimmed.length > 4000) return res.status(400).json({ error: 'Text exceeds 4000 character limit' });
  try {
    const response = await getTTS().audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input: trimmed,
      response_format: 'mp3'
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(500).json({ error: 'TTS failed' });
  }
});

app.post('/api/transcribe', authMiddleware, aiLimiter, upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file provided' });
  try {
    const mimetype = req.file.mimetype || 'audio/webm';
    const ext = mimetype.includes('mp4') || mimetype.includes('m4a') ? 'audio.mp4'
      : mimetype.includes('ogg') ? 'audio.ogg'
      : mimetype.includes('wav') ? 'audio.wav'
      : 'audio.webm';
    const filename = req.file.originalname || ext;
    const audioFile = await toFile(req.file.buffer, filename, { type: mimetype });
    const transcription = await getWhisper().audio.transcriptions.create({
      file: audioFile, model: 'whisper-1',
      language: req.body.lang === 'es' ? 'es' : req.body.lang === 'fr' ? 'fr' : 'en',
    });
    res.json({ text: transcription.text });
  } catch (err) {
    console.error('Whisper transcription error:', err.message);
    res.status(500).json({ error: 'Transcription failed', fallback: true });
  }
});

const scenarios = {
  1: { title: 'The Difficult Guest', systemPrompt: `A guest has arrived 20 minutes late for their reservation and the table has been released. He is impatient and demanding — his one issue is that he insists his table should still be held. The user is playing the server who must handle this calmly and find a solution. Keep the scenario focused: only this one problem — do not add extra complaints. React realistically: if the server is empathetic and solution-focused, the customer gradually calms down. If they are dismissive, he escalates.` },
  2: { title: 'Wine Upselling', systemPrompt: `You are a friendly but uncertain couple dining at a fine restaurant. You have a moderate budget and are unsure what wine to order. The user is playing the server who should help you choose wine and upsell appropriately. You respond positively to genuine recommendations and negatively to pushy suggestions. Ask natural questions a real guest would ask about the wine.` },
  3: { title: 'Serious Food Allergy', systemPrompt: `You are a guest with a severe nut allergy. You are polite but understandably anxious about cross-contamination. The user is playing the server who must handle this safely and reassuringly. You ask detailed questions about dishes and preparation methods. If the server seems dismissive of your allergy or guesses instead of checking, become visibly uncomfortable.` },
  4: { title: 'The Long Wait Complaint', systemPrompt: `You are a guest who has been waiting 45 minutes for your main course. You are not aggressive, but clearly frustrated and hungry. Your dining companion is also visibly unhappy. The user is playing the server who must acknowledge the wait, apologize sincerely, and resolve the situation. Respond realistically to genuine apologies versus hollow ones.` },
  5: { title: 'Dessert Upselling', systemPrompt: `You are a guest who has just finished a large main course and says you are "absolutely stuffed." The user is playing the server who must try to sell you a dessert through genuine enthusiasm and good timing. You are open to being persuaded if the server describes things compellingly. Respond naturally — if they just list desserts, you will decline; if they paint a vivid picture, you might be tempted.` },
  6: { title: 'Birthday Celebration', systemPrompt: `You are calling the restaurant to book a table for your partner's surprise 40th birthday dinner for 8 people. You want to arrange a cake, possibly a set menu, and a quiet corner table. The user is playing the server/host who takes the booking. You have lots of questions about what the restaurant can do.` },
  7: { title: 'Splitting the Bill', systemPrompt: `You are the organizer of a group of 7 friends who have finished dinner. The group wants to split the bill in a complicated way — some people want to pay only for what they ordered, two people want to split equally, and one person wants to pay separately. The user is playing the server handling the bill. React naturally — be apologetic about the complexity, but firm in how you want it split.` },
  8: { title: 'VIP Guest Arrival', systemPrompt: `You are a well-known local businessperson arriving at the restaurant. You are polite but expect exceptional service and have high standards. You have a reservation but your preferred table isn't ready. You notice small details — a slightly sticky menu, a water glass with spots. The user is playing the server who must meet these high expectations gracefully. Compliment good service genuinely.` },
  9: { title: 'The Indecisive Guest', systemPrompt: `You are a guest who cannot make up their mind. You ask lots of questions about every dish, compare options repeatedly, and keep changing your mind. You are friendly but take a long time to decide. The user is playing the server who must guide you to a decision without making you feel rushed. Respond warmly to patient, helpful guidance.` },
  10: { title: 'Wrong Order Delivered', systemPrompt: `You are a guest who has just been served the wrong dish. You ordered the salmon but received the chicken. You are not aggressive, but clearly disappointed — you specifically ordered the salmon because you don't eat red meat (though you're not strictly vegetarian). The user is playing the server who must handle the mistake. React authentically — a genuine, swift apology with fast action will win you over; excuses will frustrate you further.` },
  11: { title: 'Premium Wine Decanting', systemPrompt: `You are a sophisticated wine connoisseur who has ordered a 2015 Barolo. You expect proper tableside decanting service. You are not rude, but very knowledgeable and you will notice any mistakes in the decanting process — incorrect pour angle, not checking the sediment, not presenting the label. The user is playing the server performing the decanting. Be impressed by correct technique and gently raise questions if they seem uncertain.` },
  12: { title: 'Large Group Chaos', systemPrompt: `You are the organizer of a party of 16 for a corporate team dinner. Half the group has dietary restrictions, three people are late, and two have changed their pre-orders. You are stressed but trying to be reasonable. The user is playing the server managing this group. React positively to calm, organized handling and negatively to panic or poor communication.` },
  13: { title: 'Severe Allergy Emergency', systemPrompt: `You are a guest who, despite clear warnings given during booking, has just discovered your dish may contain traces of your severe shellfish allergy (you carry an EpiPen). You are frightened but trying to stay calm. The user is playing the server who must handle this as a genuine emergency — not just an inconvenience. If they minimize it or seem unsure, your anxiety escalates.` },
  14: { title: 'The Marriage Proposal', systemPrompt: `You are a nervous guest who pre-arranged with the restaurant to propose to your partner during dessert. The ring is with the manager, champagne is on ice, but the timing needs to be perfect. You are communicating with the server to coordinate. Your partner must NOT suspect anything. The user is playing the server who must execute this flawlessly while acting natural in front of the partner.` },
  15: { title: 'Corporate Expense Dinner', systemPrompt: `You are a CFO hosting a client dinner. You need itemized receipts, the bill split into two separate company accounts, confirmation of the restaurant's VAT number, and you have a dietary requirement not mentioned in the booking. You are professional but demanding and time-conscious. The user is playing the server who must handle this efficiently.` },
  16: { title: 'Family with Young Children', systemPrompt: `You are a parent with a 2-year-old who is becoming restless, a 5-year-old who only wants chips, and a baby who needs a high chair. You are apologetic but clearly frazzled. The user is playing the server who must make this family feel welcome and comfortable — not like a burden. React warmly to patience and creativity.` },
  17: { title: 'Vegan Tasting Menu', systemPrompt: `You are a vegan guest dining at a traditionally meat-forward fine dining restaurant. You booked in advance and confirmed your dietary needs, but you want to ensure every element of the tasting menu is genuinely vegan — not just "vegetarian." You are knowledgeable about hidden animal products (gelatin, stock, honey). The user is playing the server who must navigate this confidently.` },
  18: { title: 'The Food Critic', systemPrompt: `You are a restaurant reviewer for a respected food publication. You have not announced yourself. You are taking discreet notes, asking unusually detailed questions about sourcing, preparation, and the chef's background. You are polite but unnervingly observant. The user is playing the server who doesn't know who you are but must perform at their absolute best.` },
  19: { title: 'Last Orders Rush', systemPrompt: `You are a guest who arrives 30 minutes before the kitchen closes on a Friday night. The restaurant is packed, you are hungry, and you want a full three-course meal. The user is playing the server who must honestly manage your expectations while being hospitable. You are reasonable but insistent — you saw the closing time online as later than it is.` },
  20: { title: 'Corked Wine Return', systemPrompt: `You have just poured the wine and your partner immediately says it tastes "off" — musty, like wet cardboard. You believe it is corked. You are not confrontational but are asking the server to assess and replace the bottle. The user is playing the server who must handle this with professionalism. If they smell and agree, reward their confidence. If they dismiss your concern without checking, push back politely.` },
  21: { title: 'Dine and Dash Suspicion', systemPrompt: `You are the manager on duty. A server has come to you concerned that a table of 4 appears to be preparing to leave without paying — they have asked for the bill three times, one member went "to get cash" and hasn't returned, and they are putting on coats. The user is playing the server consulting with management. Guide them through protocol — approaching the table calmly, securing payment discreetly, without accusations.` },
  22: { title: 'Medical Situation', systemPrompt: `You are a guest at an adjacent table. A diner at the next table has suddenly slumped forward and their companion is panicking. The user is playing the server who must take immediate control — calling emergency services, clearing the area, assisting the companion, keeping other guests calm. React as a shocked but concerned nearby diner.` },
  23: { title: 'Noise Complaint', systemPrompt: `You are a guest celebrating a quiet anniversary dinner. The table next to you is a very loud, celebratory group — shouting, laughing, and occasionally swearing. You are not aggressive, but you are genuinely upset that your romantic evening is being disrupted. The user is playing the server who must resolve this diplomatically without offending either table.` },
  24: { title: 'The Food Influencer', systemPrompt: `You are a social media food influencer with 200,000 followers. You are filming every course for your stories, asking for dishes to be re-plated for better angles, asking about lighting near your table, and requesting the chef come out for a photo. Your companion is embarrassed. Service is backing up. The user is playing the server who must accommodate your reasonable requests while keeping service moving and protecting other guests' experience.` },
  25: { title: 'Sommelier Knowledge Test', systemPrompt: `You are an incredibly knowledgeable wine guest — perhaps a trained sommelier yourself. You are testing the server with specific questions: the exact vintage on the list, the specific village in Burgundy, whether the wine was fermented in oak or stainless, the producer's biodynamic certification. You are not being hostile — you genuinely love wine and want a real conversation. The user is playing the server who must be honest about the limits of their knowledge while demonstrating genuine passion.` },
  26: { title: '9-Course Tasting Menu Pacing', systemPrompt: `You are a couple who booked the 9-course tasting menu. Midway through (after course 5) you mention you have a theatre booking in 90 minutes. The kitchen needs to know. You are not blaming the restaurant — you just forgot to mention it on booking. The user is playing the server who must coordinate between you, the kitchen, and management to either adjust pacing or manage your expectations.` },
  27: { title: 'Post-Theatre Rush', systemPrompt: `You are one of 50 guests who have just arrived simultaneously from a nearby theatre — an 8pm show just ended. The restaurant is full. The user is playing the floor manager coordinating the rush. You are a guest who is hungry, has a reservation, but your table isn't ready yet. React to how well the server/manager handles the surge.` },
  28: { title: 'Celiac Disease', systemPrompt: `You have celiac disease — a genuine medical condition, not a preference. You ask very specific questions about cross-contamination: separate chopping boards, dedicated fryers, gluten in sauces. You are experienced with dining out and know all the places gluten hides. You will not tolerate "I think it's fine." The user is playing the server who must either confirm every detail with the kitchen or be completely honest about uncertainty.` },
  29: { title: 'The Overgenerous Drunk', systemPrompt: `You are a very intoxicated but extremely good-natured guest who keeps trying to tip everyone, is talking loudly about how this is the best restaurant in the world, and is now ordering a fourth bottle of expensive wine. Their companion is clearly uncomfortable and has quietly asked if you can stop serving them alcohol. The user is playing the server who must navigate this sensitively — protecting the guest's dignity, their safety, and the other guests' comfort.` },
  30: { title: 'Bisected Language Table', systemPrompt: `You are the leader of a table where 4 guests speak only French and 4 guests speak only English. You speak both. You are relaying orders but getting confused, and the non-English speakers are pointing at the menu looking confused. The user is playing the server who must serve this table with grace — using you as translator when needed, using visual menus, adapting their communication style.` },
  31: { title: 'Cocktail Recommendation', systemPrompt: `You are one half of a couple who has just sat down at the bar on a Friday night. Neither of you has looked at the cocktail menu — you are both scanning the bottles behind the bar. You say: "We have no idea what we want — surprise us?" You are enthusiastic but genuinely have no direction. You respond well to bartenders who ask smart questions about flavour preferences (fruity, spirit-forward, citrusy, etc.) and poorly to those who just rattle off names. Describe your reaction as the bartender builds the experience.` },
  32: { title: 'Upselling at the Bar', systemPrompt: `You are a solo guest who has just sat down at the bar. You glance up and say "Just a pint of whatever lager you have on tap, please." You are not unfriendly — just distracted, tired, maybe a bit bored. The bar has four craft beers on tap and a cocktail menu worth exploring. You respond well to bartenders who make you feel noticed rather than sold to — a genuine recommendation based on what you ordered feels different from a pushy upsell. If they engage you naturally, you open up. If they push too hard, you stick to the lager.` },
  33: { title: 'The Overserved Regular', systemPrompt: `You are Marcus, a regular who comes in two or three times a week. Tonight you have had four drinks over two hours and your speech has become slightly slurred, you knocked over a glass earlier, and you are now waving the bartender over for another round. You are not aggressive — you think you are perfectly fine. If the bartender refuses service gently and respectfully, you are mildly indignant but ultimately accepting. If they are condescending or abrupt, you become defensive and escalate. React authentically throughout.` },
  34: { title: 'Cocktail Knowledge Challenge', systemPrompt: `You are a well-dressed, very knowledgeable regular who has just ordered a Last Word. When it arrives, you sip it approvingly — then start asking detailed questions: the botanicals in the gin they used, the ratio versus the traditional spec, whether they have tried the mezcal variation. You are not hostile — you love great bar conversation and are genuinely curious whether this bartender knows their craft. If they answer confidently and accurately, reward them with more interesting questions. If they bluff, press them gently. If they say "I'm not sure but..." and engage honestly, respect that too.` },
  35: { title: 'Last Call Rush', systemPrompt: `It is 1:45am. Last call has just been announced and the bar has come alive. You are one of eight people trying to order at once. You have been here since 9pm and are near your limit — you are perhaps showing early signs of intoxication. You wave repeatedly, talk slightly too loudly, and are very insistent about getting your order in before the bar closes. The user is playing the bartender managing this surge. React authentically to how they handle the crowd, prioritize orders, and assess your state.` },
  36: { title: 'The Solo Bar Guest', systemPrompt: `You are a woman in your early 40s sitting alone at the bar on a quiet Wednesday evening. You ordered a glass of wine, opened your phone, then put it face-down on the bar. You have not spoken to anyone. You might want company — or you might not. The user is playing the bartender who must read the situation correctly. If they check in briefly and give you space, you respond positively with short, warm answers. If they push for conversation too hard too soon, you become slightly closed. If they completely ignore you, you feel invisible. The goal is authentic human connection at exactly the right pace — narrate your reactions honestly.` }
};

app.post('/api/roleplay', authMiddleware, aiLimiter, async (req, res) => {
  const { scenarioId, messages, lang } = req.body;
  const scenario = scenarios[scenarioId];
  if (!scenario) return res.status(400).json({ error: 'Invalid scenario' });
  const thirdPersonWrapper = lang === 'fr'
    ? `STYLE DE NARRATION — IMPORTANT : Narrez toujours le client à la troisième personne. Ne parlez jamais en tant que client à la première personne. Décrivez ce que dit et fait le client comme un narrateur : "Le client fronce les sourcils et dit : '...'". Utilisez "le client", "il", "elle" ou "ils" tout au long.\n\nBRIÈVETÉ — Soyez concis. Chaque réponse : une action brève + une réplique de dialogue. Pas de description d'ambiance, de décor ou de narration atmosphérique. Allez droit au comportement et aux mots du client.\n\n`
    : lang === 'es'
    ? `ESTILO DE NARRACIÓN — IMPORTANTE: Narra siempre al cliente en tercera persona. Nunca hables como el cliente en primera persona. Describe lo que dice y hace el cliente como narrador: "El cliente frunce el ceño y dice: '...'". Usa "el cliente", "él", "ella" o "ellos" en todo momento.\n\nBREVEDAD — Sé conciso. Cada respuesta: una acción breve + una línea de diálogo. Sin descripciones de ambiente, escenario ni narración atmosférica. Ve directo al comportamiento y las palabras del cliente.\n\n`
    : `NARRATION STYLE — IMPORTANT: Always narrate the customer in third person. Never speak as the customer in first person ("I want...", "I'm angry..."). Instead, describe what the customer says and does as a narrator: "The customer frowns and says: '...'", "He crosses his arms and replies: '...'". Use "the customer", "he", "she", or "they" throughout.\n\nBREVITY — Be concise. Each response: one short action beat + one line of dialogue. No scene-setting, no atmospheric description, no describing the restaurant or surroundings. Go straight to the guest's behavior and words.\n\n`;
  const langInstruction = lang === 'fr'
    ? 'IMPORTANT : Cette conversation se déroule en français. Tu DOIS répondre entièrement en français.\n\n'
    : lang === 'es'
    ? 'IMPORTANTE: Esta conversación ocurre en español. DEBES responder completamente en español.\n\n'
    : '';
  const systemContent = langInstruction + thirdPersonWrapper + scenario.systemPrompt;
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemContent }, ...messages],
    });
    const reply = completion.choices[0].message.content || '';
    res.json({ reply });
  } catch (err) {
    console.error('OpenAI error:', err.message);
    res.status(500).json({ error: 'AI request failed' });
  }
});

app.post('/api/roleplay/summary', authMiddleware, aiLimiter, async (req, res) => {
  const { scenarioId, messages, lang } = req.body;
  const scenario = scenarios[scenarioId];
  if (!scenario) return res.status(400).json({ error: 'Invalid scenario' });
  const langInstruction = lang === 'fr'
    ? 'IMPORTANT : Rédige toute ta réponse en français. Tous les champs JSON doivent être en français.\n\n'
    : lang === 'es'
    ? 'IMPORTANTE: Escribe toda tu respuesta en español. Todos los campos JSON deben estar en español.\n\n'
    : '';
  const systemPrompt = langInstruction + `You are a strict, experienced fine-dining hospitality trainer reviewing a server's performance in a roleplay exercise.

Scenario: "${scenario.title}"

You will be given the full conversation between the server (user) and the simulated customer (assistant). Review what the server actually said — their word choices, tone, phrasing, and actions — and provide a structured critique.

RULES:
- Be direct and specific. Reference exactly what the server said or failed to say.
- Do NOT retell or summarize the scenario plot.
- Do NOT be vague. "Good empathy" is not acceptable — say "You acknowledged the wait with 'I completely understand your frustration' which was the right move."
- Identify real mistakes, missed upsell moments, poor phrasing, or protocol gaps.
- If the server did something wrong, say so clearly.
- Keep each bullet point to one concrete observation.

Respond with valid JSON only, in this exact format${lang === 'fr' ? ' (all field values MUST be written in French)' : lang === 'es' ? ' (all field values MUST be written in Spanish)' : ''}:
{
  "verdict": "One direct sentence summarizing overall performance — honest, not flattering",
  "right": ["Specific strength referencing what was said", "Another strength if applicable"],
  "wrong": ["Specific mistake or missed opportunity referencing actual dialogue", "Another gap if applicable"],
  "tip": "One concrete, actionable coaching tip for what to do differently or better next time"
}`;
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Here is the full conversation to review:\n\n' + messages.map(m => `${m.role === 'user' ? 'SERVER' : 'CUSTOMER'}: ${m.content}`).join('\n\n') }
      ],
    });
    const raw = completion.choices[0].message.content || '{}';
    const parsed = JSON.parse(raw);
    res.json(parsed);
  } catch (err) {
    console.error('Summary AI error:', err.message);
    res.status(500).json({ error: 'Summary failed' });
  }
});

// ── Manager Dashboard API ─────────────────────────────────────────────────────

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
    res.status(500).json({ error: 'Auth error' });
  }
}

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

// Get all team members with progress
app.get('/api/team', managerMiddleware, async (req, res) => {
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
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

// Issue certificate (marks all 30 modules as complete for a user)
app.post('/api/certificate', managerMiddleware, async (req, res) => {
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
      'INSERT INTO certificate_log (user_id, issued_by, user_name) VALUES ($1, $2, $3)',
      [userId, req.user.id, user.name || user.email]
    ).catch(() => {});

    res.json({ success: true, message: `Certificate issued for ${user.name || user.email}` });
  } catch (err) {
    console.error('Certificate error:', err.message);
    res.status(500).json({ error: 'Failed to issue certificate' });
  }
});

// Export team report as CSV
app.get('/api/export-report', managerMiddleware, async (req, res) => {
  try {
    const userRes = await db.query('SELECT restaurant_id, role FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];

    const isAdmin = user?.role === 'admin';
    const whereClause = isAdmin && !user?.restaurant_id
      ? "WHERE u.role NOT IN ('manager', 'admin')"
      : "WHERE u.restaurant_id = $1 AND u.role NOT IN ('manager', 'admin')";
    const params = isAdmin && !user?.restaurant_id ? [] : [user?.restaurant_id];

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

    let csv = 'Name,Email,Level,Avg Progress,Modules Completed,Avg Quiz Score,Last Login,Status\n';
    for (const row of staffRes.rows) {
      const avg = Math.round(Number(row.avg_progress));
      const status = calculateStatus([avg]);
      const lastLogin = row.last_login ? new Date(row.last_login).toLocaleDateString() : 'Never';
      csv += `"${row.name || ''}","${row.email}","${row.experience_level || ''}",${avg}%,${row.modules_completed},${Math.round(Number(row.avg_quiz_score))}%,"${lastLogin}","${status}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="team-report-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('Export error:', err.message);
    res.status(500).json({ error: 'Failed to export report' });
  }
});

// ── User: language preference ────────────────────────────────────────────────
app.patch('/api/user/lang', authMiddleware, async (req, res) => {
  const { lang } = req.body;
  if (!['en', 'fr', 'es'].includes(lang)) return res.status(400).json({ error: 'Invalid lang' });
  try {
    await db.query('UPDATE users SET lang_preference = $1 WHERE id = $2', [lang, req.user.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to save language' }); }
});

// ── User: module bookmarks ───────────────────────────────────────────────────
app.get('/api/user/bookmarks', authMiddleware, async (req, res) => {
  try {
    const result = await db.query('SELECT module_id, created_at FROM module_bookmarks WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json({ bookmarks: result.rows.map(r => r.module_id) });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch bookmarks' }); }
});

app.post('/api/user/bookmarks', authMiddleware, async (req, res) => {
  const { moduleId } = req.body;
  if (!moduleId) return res.status(400).json({ error: 'moduleId required' });
  try {
    await db.query('INSERT INTO module_bookmarks (user_id, module_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, moduleId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to add bookmark' }); }
});

app.delete('/api/user/bookmarks/:moduleId', authMiddleware, async (req, res) => {
  try {
    await db.query('DELETE FROM module_bookmarks WHERE user_id = $1 AND module_id = $2', [req.user.id, req.params.moduleId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to remove bookmark' }); }
});

// ── User: scenario transcripts ───────────────────────────────────────────────
app.post('/api/user/scenario-transcript', authMiddleware, async (req, res) => {
  const { scenarioId, messages, verdict } = req.body;
  if (!scenarioId || !messages) return res.status(400).json({ error: 'scenarioId and messages required' });
  try {
    await db.query(
      'INSERT INTO scenario_transcripts (user_id, scenario_id, messages, verdict) VALUES ($1, $2, $3, $4)',
      [req.user.id, scenarioId, JSON.stringify(messages), verdict || null]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to save transcript' }); }
});

app.get('/api/user/scenario-transcripts', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, scenario_id, verdict, completed_at FROM scenario_transcripts WHERE user_id = $1 ORDER BY completed_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json({ transcripts: result.rows });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch transcripts' }); }
});

app.get('/api/user/scenario-transcripts/:id', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, scenario_id, messages, verdict, completed_at FROM scenario_transcripts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Transcript not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch transcript' }); }
});

// ── Manager: enhanced staff detail ──────────────────────────────────────────
app.get('/api/manager/staff/:id', managerMiddleware, async (req, res) => {
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
  } catch (err) { res.status(500).json({ error: 'Failed to fetch staff details' }); }
});

// ── Manager: email nudge ─────────────────────────────────────────────────────
app.post('/api/manager/nudge', managerMiddleware, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const userRes = await db.query('SELECT name, email FROM users WHERE id = $1', [userId]);
    if (!userRes.rows.length) return res.status(404).json({ error: 'User not found' });
    const { name, email } = userRes.rows[0];
    const displayName = name || email.split('@')[0];
    const nudgeUnsubToken = await getOrCreateUnsubToken(userId);
    const nudgeUnsubUrl = `https://servemasteracademy.ca/unsubscribe?token=${nudgeUnsubToken}`;
    await resend.emails.send({
      from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
      to: email,
      subject: 'Your team wants you to keep training — you\'re almost there',
      html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
        <img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;">
        <p style="font-size:16px;line-height:1.7;">Hi ${escapeHtml(displayName)},</p>
        <p style="font-size:16px;line-height:1.7;">Your manager wanted to check in and encourage you to continue your ServeMaster Academy training.</p>
        <p style="font-size:16px;line-height:1.7;">Your team is making great progress — and every module you complete builds real skills you'll use on the floor every shift.</p>
        <p style="margin:32px 0;"><a href="https://servemasteracademy.ca/app" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Continue Training →</a></p>
        ${emailFooter(nudgeUnsubUrl)}
      </div>`
    });
    res.json({ success: true, to: email });
  } catch (err) { res.status(500).json({ error: 'Failed to send nudge: ' + err.message }); }
});

// ── Manager: training deadline ───────────────────────────────────────────────
app.get('/api/manager/deadline', managerMiddleware, async (req, res) => {
  try {
    const userRes = await db.query('SELECT restaurant_id FROM users WHERE id = $1', [req.user.id]);
    const restaurantId = userRes.rows[0]?.restaurant_id;
    if (!restaurantId) return res.json({ deadline: null });
    const result = await db.query('SELECT training_deadline FROM restaurants WHERE id = $1', [restaurantId]);
    res.json({ deadline: result.rows[0]?.training_deadline || null });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch deadline' }); }
});

app.post('/api/manager/deadline', managerMiddleware, async (req, res) => {
  const { deadline } = req.body;
  try {
    const userRes = await db.query('SELECT restaurant_id FROM users WHERE id = $1', [req.user.id]);
    const restaurantId = userRes.rows[0]?.restaurant_id;
    if (!restaurantId) return res.status(400).json({ error: 'No restaurant found' });
    await db.query('UPDATE restaurants SET training_deadline = $1 WHERE id = $2', [deadline || null, restaurantId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to set deadline' }); }
});

// ── Manager: certificate history ─────────────────────────────────────────────
app.get('/api/manager/certificates', managerMiddleware, async (req, res) => {
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
  } catch (err) { res.status(500).json({ error: 'Failed to fetch certificates' }); }
});

// ── Admin: activation funnel ─────────────────────────────────────────────────
app.get('/api/admin/funnel', adminMiddleware, async (req, res) => {
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
        { label: 'Signed Up', count: parseInt(signups.rows[0].cnt), pct: 100 },
        { label: 'Started Trial', count: parseInt(trialStarted.rows[0].cnt), pct: Math.round(parseInt(trialStarted.rows[0].cnt) / total * 100) },
        { label: 'Completed Module 1', count: parseInt(mod1.rows[0].cnt), pct: Math.round(parseInt(mod1.rows[0].cnt) / total * 100) },
        { label: 'Completed Module 5', count: parseInt(mod5.rows[0].cnt), pct: Math.round(parseInt(mod5.rows[0].cnt) / total * 100) },
        { label: 'Completed Module 10', count: parseInt(mod10.rows[0].cnt), pct: Math.round(parseInt(mod10.rows[0].cnt) / total * 100) },
        { label: 'Converted to Paid', count: parseInt(paid.rows[0].cnt), pct: Math.round(parseInt(paid.rows[0].cnt) / total * 100) },
      ]
    });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch funnel data' }); }
});

// ── Admin: module analytics (drop-off) ──────────────────────────────────────
app.get('/api/admin/analytics', adminMiddleware, async (req, res) => {
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

// ── Admin: Stripe revenue ─────────────────────────────────────────────────────
app.get('/api/admin/stripe-revenue', adminMiddleware, async (req, res) => {
  try {
    const stripe = await getUncachableStripeClient();
    const [activeSubs, invoices30d] = await Promise.all([
      stripe.subscriptions.list({ status: 'active', limit: 100 }),
      stripe.invoices.list({ status: 'paid', limit: 100, created: { gte: Math.floor(Date.now() / 1000) - 30 * 86400 } }),
    ]);
    const mrr = activeSubs.data.reduce((sum, sub) => {
      const item = sub.items?.data?.[0];
      if (!item) return sum;
      const amount = item.price?.unit_amount || 0;
      const interval = item.price?.recurring?.interval;
      if (interval === 'year') return sum + amount / 12;
      return sum + amount;
    }, 0);
    const revenue30d = invoices30d.data.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);
    res.json({
      mrr: Math.round(mrr / 100),
      active_subscriptions: activeSubs.data.length,
      revenue_30d: Math.round(revenue30d / 100),
    });
  } catch (err) {
    console.error('Stripe revenue error:', err.message);
    res.json({ mrr: 0, active_subscriptions: 0, revenue_30d: 0, error: 'Stripe unavailable' });
  }
});

// ── Admin: failed payments ────────────────────────────────────────────────────
app.get('/api/admin/failed-payments', adminMiddleware, async (req, res) => {
  try {
    const stripe = await getUncachableStripeClient();
    const invoices = await stripe.invoices.list({ status: 'open', limit: 50 });
    const failed = invoices.data.filter(inv => inv.attempt_count > 0);
    const result = await Promise.all(failed.map(async inv => {
      let email = '';
      try {
        const customer = await stripe.customers.retrieve(inv.customer);
        email = customer.email || '';
      } catch {}
      return {
        id: inv.id,
        customer_email: email,
        amount: Math.round((inv.amount_due || 0) / 100),
        attempts: inv.attempt_count,
        next_attempt: inv.next_payment_attempt ? new Date(inv.next_payment_attempt * 1000).toISOString() : null,
        created: new Date(inv.created * 1000).toISOString(),
      };
    }));
    res.json({ failed_payments: result });
  } catch (err) {
    console.error('Failed payments error:', err.message);
    res.json({ failed_payments: [], error: 'Stripe unavailable' });
  }
});

// ── Admin: bulk email by segment ─────────────────────────────────────────────
app.post('/api/admin/bulk-email', adminMiddleware, async (req, res) => {
  const { segment, emailType } = req.body;
  if (!segment || !emailType) return res.status(400).json({ error: 'segment and emailType required' });
  try {
    let query = '';
    if (segment === 'free_inactive') {
      query = `SELECT id, name, email FROM users WHERE subscription_status = 'free' AND (last_login < NOW() - INTERVAL '7 days' OR last_login IS NULL) AND role = 'user' LIMIT 200`;
    } else if (segment === 'trial_active') {
      query = `SELECT id, name, email FROM users WHERE is_trial_active = true AND subscription_status = 'free' LIMIT 200`;
    } else if (segment === 'paid_incomplete') {
      query = `SELECT DISTINCT u.id, u.name, u.email FROM users u WHERE u.subscription_status NOT IN ('free') AND (SELECT COUNT(*) FROM user_progress WHERE user_id = u.id AND progress >= 100) < 30 LIMIT 200`;
    } else if (segment === 'all_users') {
      query = `SELECT id, name, email FROM users WHERE role = 'user' LIMIT 200`;
    } else {
      return res.status(400).json({ error: 'Unknown segment' });
    }
    const users = await db.query(query);
    if (!users.rows.length) return res.json({ sent: 0, message: 'No users in this segment' });
    const emailShell = (body, unsubUrl) => `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">${body}${emailFooter(unsubUrl)}</div>`;
    const p = (text) => `<p style="font-size:16px;line-height:1.7;margin-bottom:16px;">${text}</p>`;
    const btn = (label, href) => `<p style="margin-bottom:32px;"><a href="${href}" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">${label}</a></p>`;
    const sig = `<p style="font-size:15px;line-height:1.7;color:#a3a3a3;margin-top:24px;"><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy</p>`;
    const emails = {
      nudge: { subject: 'Your training is waiting — pick up where you left off', html: (name, unsubUrl) => emailShell(`${p(`Hi ${name},`)}${p("We noticed you haven't been in for a while — your training is still right where you left it.")}${p("Even 15 minutes a day adds up fast. Start your next module now.")}${btn("Continue Training →", "https://servemasteracademy.ca/app")}${sig}`, unsubUrl) },
      upgrade: { subject: 'Ready to go further? Upgrade your ServeMaster plan', html: (name, unsubUrl) => emailShell(`${p(`Hi ${name},`)}${p("You've been making progress on ServeMaster Academy — and there's so much more to unlock.")}${p("Upgrade today to access all 30 modules, AI role-play, voice practice, and your completion certificate.")}${btn("View Plans →", "https://servemasteracademy.ca/pricing")}${sig}`, unsubUrl) },
      comeback: { subject: 'We miss you at ServeMaster Academy', html: (name, unsubUrl) => emailShell(`${p(`Hi ${name},`)}${p("It's been a while since we've seen you in the training platform.")}${p("Your account is still active — log back in and continue from where you left off.")}${btn("Log Back In →", "https://servemasteracademy.ca/app")}${sig}`, unsubUrl) },
    };
    const chosenEmail = emails[emailType];
    if (!chosenEmail) return res.status(400).json({ error: `Unknown emailType. Valid: ${Object.keys(emails).join(', ')}` });
    let sent = 0, failed = 0;
    for (const user of users.rows) {
      try {
        const bulkUnsubToken = await getOrCreateUnsubToken(user.id);
        const bulkUnsubUrl = `https://servemasteracademy.ca/unsubscribe?token=${bulkUnsubToken}`;
        await resend.emails.send({
          from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
          to: user.email,
          subject: chosenEmail.subject,
          html: chosenEmail.html(escapeHtml(user.name || user.email.split('@')[0]), bulkUnsubUrl)
        });
        sent++;
        await new Promise(r => setTimeout(r, 100));
      } catch { failed++; }
    }
    res.json({ sent, failed, total: users.rows.length });
  } catch (err) { res.status(500).json({ error: 'Bulk email failed: ' + err.message }); }
});

// ── Admin: user impersonation ─────────────────────────────────────────────────
app.post('/api/admin/impersonate/:id', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userRes = await db.query('SELECT id, email, name, role FROM users WHERE id = $1', [id]);
    if (!userRes.rows.length) return res.status(404).json({ error: 'User not found' });
    const user = userRes.rows[0];
    if (user.role === 'admin') return res.status(403).json({ error: 'Cannot impersonate admin' });
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role, impersonated_by: req.user.id },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) { res.status(500).json({ error: 'Impersonation failed' }); }
});

// ── Admin: user progress detail ───────────────────────────────────────────────
app.get('/api/admin/users/:id/progress', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [userRes, progressRes, scenarioRes, badgeRes] = await Promise.all([
      db.query('SELECT id, name, email, role, subscription_status, created_at, last_login FROM users WHERE id = $1', [id]),
      db.query('SELECT module_id, progress, quiz_score, completed_at FROM user_progress WHERE user_id = $1 ORDER BY module_id', [id]),
      db.query('SELECT COUNT(*) as cnt FROM scenario_scores WHERE user_id = $1', [id]),
      db.query('SELECT badge_id, earned_at FROM badges WHERE user_id = $1', [id]),
    ]);
    if (!userRes.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({
      user: userRes.rows[0],
      progress: progressRes.rows,
      scenario_count: parseInt(scenarioRes.rows[0]?.cnt) || 0,
      badges: badgeRes.rows,
    });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch user progress' }); }
});

// ── Catch-all: /app/* ─────────────────────────────────────────────────────────
app.get('/app/{*path}', (req, res) => res.sendFile(path.join(__dirname, 'app.html')));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Stripe init and startup ───────────────────────────────────────────────────
async function initStripe() {
  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return console.warn('No DATABASE_URL, skipping Stripe init');
    const isReplit = !!process.env.REPLIT_DOMAINS;
    if (isReplit) {
      const { runMigrations } = require('stripe-replit-sync');
      await runMigrations({ databaseUrl });
      const stripeSync = await getStripeSync();
      const domain = process.env.REPLIT_DOMAINS.split(',')[0];
      const webhookUrl = `https://${domain}/api/stripe/webhook`;
      await stripeSync.findOrCreateManagedWebhook(webhookUrl);
      stripeSync.syncBackfill().catch(e => console.error('Stripe backfill error:', e.message));
    } else {
      console.log('Non-Replit environment — Stripe webhook must be registered manually in the Stripe dashboard.');
    }
    console.log('Stripe initialized');
  } catch (err) {
    console.warn('Stripe init warning (non-fatal):', err.message);
  }
}


const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log(`ServeMaster Academy running on port ${PORT}`);
  try {
    const updated = await db.query(
      "UPDATE users SET role = 'admin', subscription_status = 'premium' WHERE email = $1 RETURNING email",
      [ADMIN_EMAIL]
    );
    if (updated.rows.length) console.log(`Admin role granted to ${ADMIN_EMAIL} on startup`);
  } catch (e) {}
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS referrals (
      id SERIAL PRIMARY KEY,
      referrer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_email VARCHAR(255) NOT NULL,
      referred_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      credited_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    await db.query('CREATE INDEX IF NOT EXISTS idx_referrals_referred_email ON referrals(referred_email)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status)');
    await db.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_unique_invite ON referrals(referrer_user_id, referred_email)');
  } catch (e) { console.error('Referrals table bootstrap error:', e.message); }
  await initStripe();
  // Auto-seed demo leaderboard users on every startup
  try { await seedDemoUsers(); } catch (e) { console.error('Demo seed error:', e.message); }
  // Seed admin (Kirk) progress to 100% if account exists
  try { await seedAdminProgress(); } catch (e) { console.warn('Admin progress seed warning:', e.message); }

  // New schema additions
  try {
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS lang_preference VARCHAR(5) DEFAULT 'en'`);
    await db.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS training_deadline DATE`);
    await db.query(`CREATE TABLE IF NOT EXISTS certificate_log (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      issued_by INT REFERENCES users(id) ON DELETE SET NULL,
      user_name VARCHAR(255),
      issued_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS scenario_transcripts (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      scenario_id INT,
      messages JSONB NOT NULL,
      verdict TEXT,
      completed_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scenario_transcripts_user ON scenario_transcripts(user_id)`);
    await db.query(`CREATE TABLE IF NOT EXISTS module_bookmarks (
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      module_id INT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, module_id)
    )`);
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_unsubscribed BOOLEAN DEFAULT FALSE`);
    await db.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS cert_logo_url TEXT`);
    await db.query(`CREATE TABLE IF NOT EXISTS unsubscribe_tokens (
      user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS email_drip_log (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      day_sent INT NOT NULL,
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, day_sent)
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS assigned_modules (
      restaurant_id INT REFERENCES restaurants(id) ON DELETE CASCADE,
      module_id INT NOT NULL,
      assigned_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (restaurant_id, module_id)
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await db.query(`INSERT INTO site_settings (key, value) VALUES ('chat_enabled','false') ON CONFLICT (key) DO NOTHING`);
    await db.query(`ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS access_days INT`);
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_access_expires_at TIMESTAMPTZ`);
    console.log('Schema additions complete');
  } catch (e) { console.error('Schema additions error:', e.message); }
});
// ── Site settings routes ────────────────────────────────────────────────────────
app.get('/api/chat-config', async (req, res) => {
  try {
    const r = await db.query(`SELECT value FROM site_settings WHERE key = 'chat_enabled'`);
    const enabled = r.rows.length > 0 && r.rows[0].value === 'true';
    res.json({ enabled });
  } catch (e) { res.json({ enabled: false }); }
});

const CHAT_SYSTEM_PROMPT = `You are the AI assistant for ServeMaster Academy (servemasteracademy.ca), a professional hospitality training platform based in Canada. You help visitors learn about the platform and decide if it's right for them.

About ServeMaster Academy:
- 30 expert training modules covering all aspects of professional restaurant service
- 36 AI roleplay scenarios with an AI guest across 5 categories (Guest Relations, Wine & Beverage, Special Occasions, Rush & Pressure, Health & Safety)
- Voice practice using Whisper AI transcription — speak out loud like the real floor
- Completion certificate (PDF download) after finishing all 30 modules
- Gamification: badges, daily streaks, leaderboard
- Trilingual: English, French, Spanish (EN/FR/ES)
- Manager Dashboard for restaurant owners/managers to track staff progress, assign modules, get weekly digest emails
- PWA — works offline, mobile-first design

Pricing (CAD, all with 14-day free trial):
- Free: $0 — 3 modules, 5 AI scenarios, forever free
- Premium Monthly: $19/mo — all 30 modules, all 36 scenarios, voice roleplay, certificate
- Premium Annual: $149/yr (~$12.42/mo, save 35%) — same as Premium + 2 months free
- Starter Team: $99/mo — up to 10 staff, manager dashboard, assign required modules, weekly digest
- Pro Team: $199/mo — unlimited staff, custom AI scenarios, advanced analytics, priority support
- Starter Team Annual: $990/yr (~$82.50/mo, save ~17%)
- Pro Team Annual: $1,990/yr (~$165.83/mo, save ~17%)
- Enterprise: custom pricing — multi-location, white-label, SSO, API access

Keep answers concise, helpful, and friendly. If someone asks about pricing, always mention the free tier and 14-day trial. If they want to sign up, direct them to /signup. If they have a billing issue, direct them to support@servemasteracademy.ca. Answer in the same language the visitor uses.`;

app.post('/api/chat', async (req, res) => {
  try {
    const settingRow = await db.query(`SELECT value FROM site_settings WHERE key = 'chat_enabled'`);
    const chatEnabled = settingRow.rows.length > 0 && settingRow.rows[0].value === 'true';
    if (!chatEnabled) return res.status(403).json({ error: 'Chat not enabled' });

    const { message, history = [] } = req.body;
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message required' });

    const messages = [
      { role: 'system', content: CHAT_SYSTEM_PROMPT },
      ...history.slice(-10)
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: String(m.content).slice(0, 1000) })),
      { role: 'user', content: message.slice(0, 500) }
    ];

    const grok = getGrok();
    const completion = await grok.chat.completions.create({
      model: 'grok-3-mini',
      messages,
      max_tokens: 400,
      temperature: 0.7
    });

    const reply = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
    res.json({ reply });
  } catch (e) {
    console.error('Chat error:', e.message);
    res.status(500).json({ error: 'Chat service unavailable' });
  }
});


app.get('/api/admin/site-settings', adminMiddleware, async (req, res) => {
  try {
    const r = await db.query(`SELECT key, value FROM site_settings`);
    const map = Object.fromEntries(r.rows.map(row => [row.key, row.value]));
    res.json(map);
  } catch (e) { res.status(500).json({ error: 'Failed to load settings' }); }
});

app.post('/api/admin/site-settings', adminMiddleware, async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key required' });
    await db.query(
      `INSERT INTO site_settings (key, value, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
      [key, String(value)]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Failed to save setting' }); }
});

// ── Unsubscribe routes ─────────────────────────────────────────────────────────
app.get('/unsubscribe', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/');
  try {
    const r = await db.query('SELECT user_id FROM unsubscribe_tokens WHERE token = $1', [token]);
    if (!r.rows.length) return res.sendFile(path.join(__dirname, 'public', 'unsubscribe.html'));
    await db.query('UPDATE users SET is_unsubscribed = TRUE WHERE id = $1', [r.rows[0].user_id]);
    res.sendFile(path.join(__dirname, 'public', 'unsubscribe.html'));
  } catch (e) { console.error('Unsubscribe GET error:', e.message); res.redirect('/'); }
});

app.post('/api/unsubscribe', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Missing token' });
  try {
    const r = await db.query('SELECT user_id FROM unsubscribe_tokens WHERE token = $1', [token]);
    if (!r.rows.length) return res.status(404).json({ error: 'Invalid token' });
    await db.query('UPDATE users SET is_unsubscribed = TRUE WHERE id = $1', [r.rows[0].user_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/resubscribe', authMiddleware, async (req, res) => {
  try {
    await db.query('UPDATE users SET is_unsubscribed = FALSE WHERE id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ── Assigned modules routes ─────────────────────────────────────────────────────
app.get('/api/manager/assigned-modules', authMiddleware, async (req, res) => {
  try {
    const rr = await db.query('SELECT id FROM restaurants WHERE manager_id = $1', [req.user.id]);
    if (!rr.rows.length) return res.json({ modules: [] });
    const r = await db.query('SELECT module_id FROM assigned_modules WHERE restaurant_id = $1', [rr.rows[0].id]);
    res.json({ modules: r.rows.map(x => x.module_id) });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/manager/assign', authMiddleware, async (req, res) => {
  const { moduleId } = req.body;
  if (!moduleId) return res.status(400).json({ error: 'Missing moduleId' });
  try {
    const rr = await db.query('SELECT id FROM restaurants WHERE manager_id = $1', [req.user.id]);
    if (!rr.rows.length) return res.status(404).json({ error: 'No restaurant found' });
    await db.query('INSERT INTO assigned_modules (restaurant_id, module_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [rr.rows[0].id, moduleId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/manager/assign/:moduleId', authMiddleware, async (req, res) => {
  try {
    const rr = await db.query('SELECT id FROM restaurants WHERE manager_id = $1', [req.user.id]);
    if (!rr.rows.length) return res.status(404).json({ error: 'No restaurant found' });
    await db.query('DELETE FROM assigned_modules WHERE restaurant_id = $1 AND module_id = $2', [rr.rows[0].id, req.params.moduleId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// GET assigned modules for a member (used in app.html)
app.get('/api/user/assigned-modules', authMiddleware, async (req, res) => {
  try {
    const memRes = await db.query('SELECT restaurant_id FROM restaurant_members WHERE user_id = $1', [req.user.id]);
    if (!memRes.rows.length) return res.json({ modules: [] });
    const r = await db.query('SELECT module_id FROM assigned_modules WHERE restaurant_id = $1', [memRes.rows[0].restaurant_id]);
    res.json({ modules: r.rows.map(x => x.module_id) });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ── Certificate logo routes ─────────────────────────────────────────────────────
app.get('/api/manager/cert-logo', authMiddleware, async (req, res) => {
  try {
    const rr = await db.query('SELECT cert_logo_url FROM restaurants WHERE manager_id = $1', [req.user.id]);
    res.json({ certLogoUrl: rr.rows[0]?.cert_logo_url || '' });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/manager/cert-logo', authMiddleware, async (req, res) => {
  const { certLogoUrl } = req.body;
  try {
    await db.query('UPDATE restaurants SET cert_logo_url = $1 WHERE manager_id = $2', [certLogoUrl || null, req.user.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ── Admin weekly digest trigger ─────────────────────────────────────────────────
app.post('/api/admin/trigger-weekly-digest', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const sent = await sendWeeklyManagerDigests();
    res.json({ success: true, sent });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
