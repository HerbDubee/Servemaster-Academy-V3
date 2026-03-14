const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai').default;
const { toFile } = require('openai');
const { getUncachableStripeClient, getStripePublishableKey, getStripeSync } = require('./stripeClient');
const { Resend } = require('resend');
const db = require('./db');

const resend = new Resend(process.env.RESEND_API_KEY);

const authLimiter    = rateLimit({ windowMs: 15 * 60 * 1000, max: 10,  standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Please try again in 15 minutes.' } });
const aiLimiter      = rateLimit({ windowMs: 15 * 60 * 1000, max: 30,  standardHeaders: true, legacyHeaders: false, message: { error: 'Too many AI requests. Please slow down.' } });
const contactLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5,   standardHeaders: true, legacyHeaders: false, message: { error: 'Too many submissions. Please try again later.' } });

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
app.use(compression());
app.use(cookieParser());
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

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const HELLO_EMAIL = process.env.HELLO_EMAIL || '';

const mailer = (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
  : null;

const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE_OPTS = { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax', secure: IS_PROD };

const PLAN_TIER_ORDER = ['free', 'premium', 'starter_team', 'pro_team', 'enterprise'];
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
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) throw new Error('No OpenAI API key configured. Set OPENAI_API_KEY.');
  _whisper = new OpenAI({ apiKey });
  return _whisper;
}

// ── Referral credit helper ───────────────────────────────────────────────────
async function processReferralCredit(payingUserEmail) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const ref = await client.query(
      `SELECT r.id, r.referrer_user_id, u.stripe_customer_id, u.email AS referrer_email, u.name AS referrer_name
       FROM referrals r JOIN users u ON u.id = r.referrer_user_id
       WHERE r.referred_email = $1 AND r.status = 'pending'
       ORDER BY r.created_at ASC LIMIT 1 FOR UPDATE OF r SKIP LOCKED`,
      [payingUserEmail.toLowerCase()]
    );
    if (ref.rows.length === 0) { await client.query('ROLLBACK'); return; }
    const { id: refId, stripe_customer_id, referrer_email, referrer_name } = ref.rows[0];
    if (stripe_customer_id) {
      const stripe = await getUncachableStripeClient();
      await stripe.customers.createBalanceTransaction(stripe_customer_id, {
        amount: -5000,
        currency: 'cad',
        description: 'Referral credit — thank you for inviting a manager!'
      });
      await client.query('UPDATE referrals SET status = $1, credited_at = NOW() WHERE id = $2', ['credited', refId]);
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

  if (process.env.REPLIT_DOMAINS) {
    try {
      const sync = await getStripeSync();
      await sync.processWebhook(req.body, sig);
      try {
        const rawEvent = JSON.parse(req.body.toString());
        if (rawEvent.type === 'checkout.session.completed') {
          const session = rawEvent.data?.object;
          if (session && (session.payment_status === 'paid' || session.status === 'complete') && session.customer) {
            const payingUser = await db.query('SELECT email FROM users WHERE stripe_customer_id = $1', [session.customer]);
            if (payingUser.rows.length > 0) processReferralCredit(payingUser.rows[0].email);
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

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
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
              [plan === 'premium_annual' ? 'premium' : plan, session.subscription, customerId]
            );
          }
          const payingUser = await db.query('SELECT email FROM users WHERE stripe_customer_id = $1', [customerId]);
          if (payingUser.rows.length > 0) {
            processReferralCredit(payingUser.rows[0].email);
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
      'SELECT subscription_status, trial_ends_at, is_trial_active FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows.length) return res.status(401).json({ error: 'User not found' });
    const user = rows[0];

    if (user.subscription_status === 'active') return next();

    const now = new Date();
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
app.get('/manager-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'manager-dashboard.html')));
app.get('/blog', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog', 'index.html')));
app.get('/blog/wine-service-tips', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog', 'wine-service-tips.html')));
app.get('/blog/special-occasions', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog', 'special-occasions.html')));
app.get('/blog/tray-technique', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog', 'tray-technique.html')));
app.get('/blog/server-career', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog', 'server-career.html')));
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
    db.query(
      'UPDATE referrals SET referred_user_id = $1 WHERE referred_email = $2 AND status = $3 AND referred_user_id IS NULL',
      [user.id, user.email, 'pending']
    ).catch(err => console.error('Referral link error:', err.message));
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('token', token, COOKIE_OPTS);
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, token, message: 'Account created – 14-day trial started!' });
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
          <hr style="border:none;border-top:1px solid #333;margin:32px 0;">
          <p style="font-size:12px;color:#666;line-height:1.6;">ServeMaster Academy · <a href="https://servemasteracademy.ca" style="color:#666;">servemasteracademy.ca</a></p>
        </div>
      `
    }).catch(err => console.error('Welcome email error:', err.message));
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
          [profile.email, profile.sub, profile.name, 'New to serving', trialEndsAt, true]
        );
        user = ins.rows[0];
        isNewUser = true;
        await db.query('INSERT INTO streaks (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
        db.query(
          'UPDATE referrals SET referred_user_id = $1 WHERE referred_email = $2 AND status = $3 AND referred_user_id IS NULL',
          [user.id, user.email, 'pending']
        ).catch(err => console.error('Referral link (Google) error:', err.message));
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
      resend.emails.send({
        from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
        to: user.email,
        subject: 'Welcome to ServeMaster Academy – Your 14-day trial starts now',
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(user.name)},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">I'm Kirk Adamson, founder of ServeMaster Academy.</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Thank you for starting your free trial. I created this platform because I believe every guest deserves to feel truly cared for — and every server deserves the tools to make that happen.</p><p style="font-size:16px;line-height:1.7;margin-bottom:32px;">Your 14-day journey begins now. I recommend starting with Module 1: Foundations of Exceptional Service.</p><p style="margin-bottom:32px;"><a href="https://servemasteracademy.ca/app" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Start Module 1 Now</a></p><p style="font-size:16px;line-height:1.7;margin-bottom:24px;">I'd love to hear what you think after your first session.</p><p style="font-size:15px;line-height:1.7;color:#a3a3a3;">Warm regards,<br><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy<br><a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#d4af37;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a></p><hr style="border:none;border-top:1px solid #333;margin:32px 0;"><p style="font-size:12px;color:#666;line-height:1.6;">ServeMaster Academy · <a href="https://servemasteracademy.ca" style="color:#666;">servemasteracademy.ca</a></p></div>`
      }).catch(err => console.error('Google welcome email error:', err.message));
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
  const daysLeft = Math.max(0, Math.ceil((new Date(user.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)));
  const safeName = escapeHtml(user.name);
  if (daysLeft <= 4 && daysLeft > 0 && !user.day10_email_sent) {
    db.query('UPDATE users SET day7_email_sent = TRUE, day10_email_sent = TRUE WHERE id = $1', [user.id]).catch(() => {});
    resend.emails.send({
      from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
      to: user.email,
      subject: 'Your trial ends in 4 days — save 20% today',
      html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${safeName},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Your 14-day free trial ends in just 4 days.</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">If you're enjoying the training and want to keep access to all 12 modules, the AI role-play, and the manager dashboard, now is a great time to upgrade.</p><p style="font-size:16px;line-height:1.7;margin-bottom:32px;">Use code <strong style="color:#d4af37;font-size:18px;letter-spacing:1px;">LAUNCH20</strong> for 20% off your first month.</p><p style="margin-bottom:32px;"><a href="https://servemasteracademy.ca/pricing" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Upgrade Now</a></p><p style="font-size:15px;line-height:1.7;color:#a3a3a3;"><strong style="color:#f5f5f5;">Kirk</strong><br><a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#d4af37;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a></p><hr style="border:none;border-top:1px solid #333;margin:32px 0;"><p style="font-size:12px;color:#666;line-height:1.6;">ServeMaster Academy · <a href="https://servemasteracademy.ca" style="color:#666;">servemasteracademy.ca</a></p></div>`
    }).catch(err => console.error('Day 10 email error:', err.message));
  } else if (daysLeft <= 7 && daysLeft > 0 && !user.day7_email_sent) {
    db.query('UPDATE users SET day7_email_sent = TRUE WHERE id = $1', [user.id]).catch(() => {});
    resend.emails.send({
      from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
      to: user.email,
      subject: 'You\'re halfway through your trial — here\'s what to try next',
      html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${safeName},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">You're now halfway through your 14-day trial.</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Many users tell me that by Day 7 they already feel more confident handling wine service and special occasions.</p><p style="font-size:16px;line-height:1.7;margin-bottom:32px;">If you haven't tried the Voice Practice yet, I highly recommend it — it's one of the features our early restaurant teams love most.</p><p style="margin-bottom:32px;"><a href="https://servemasteracademy.ca/app" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Continue Training</a></p><p style="font-size:15px;line-height:1.7;color:#a3a3a3;"><strong style="color:#f5f5f5;">Kirk</strong><br><a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#d4af37;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a></p><hr style="border:none;border-top:1px solid #333;margin:32px 0;"><p style="font-size:12px;color:#666;line-height:1.6;">ServeMaster Academy · <a href="https://servemasteracademy.ca" style="color:#666;">servemasteracademy.ca</a></p></div>`
    }).catch(err => console.error('Day 7 email error:', err.message));
  }
  if (daysLeft <= 2 && daysLeft > 0 && !user.day13_email_sent) {
    db.query('UPDATE users SET day13_email_sent = TRUE WHERE id = $1', [user.id]).catch(() => {});
    resend.emails.send({
      from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
      to: user.email,
      subject: 'Your trial ends very soon — keep your access',
      html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${safeName},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Your free trial ends very soon.</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">If you've found value in the training, I'd love for you to continue the journey with a full membership.</p><p style="font-size:16px;line-height:1.7;margin-bottom:32px;">Use code <strong style="color:#d4af37;font-size:18px;letter-spacing:1px;">LAUNCH20</strong> for 20% off your first month or year.</p><p style="margin-bottom:32px;"><a href="https://servemasteracademy.ca/pricing" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Keep Access →</a></p><p style="font-size:15px;line-height:1.7;color:#a3a3a3;"><strong style="color:#f5f5f5;">Kirk</strong><br><a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#d4af37;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a></p><hr style="border:none;border-top:1px solid #333;margin:32px 0;"><p style="font-size:12px;color:#666;line-height:1.6;">ServeMaster Academy · <a href="https://servemasteracademy.ca" style="color:#666;">servemasteracademy.ca</a></p></div>`
    }).catch(err => console.error('Day 13 email error:', err.message));
  }
  if (daysLeft === 0 && !user.trial_expired_email_sent) {
    db.query('UPDATE users SET trial_expired_email_sent = TRUE WHERE id = $1', [user.id]).catch(() => {});
    resend.emails.send({
      from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
      to: user.email,
      subject: 'Your trial has ended — 20% off for the next 7 days',
      html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${safeName},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Your 14-day free trial has ended.</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">I hope you had a chance to experience what ServeMaster Academy is all about — the fine-dining standards, the voice practice, the scenario simulations.</p><p style="font-size:16px;line-height:1.7;margin-bottom:32px;">If you're ready to continue, use code <strong style="color:#d4af37;font-size:18px;letter-spacing:1px;">LAUNCH20</strong> for 20% off. This offer is valid for 7 days.</p><p style="margin-bottom:32px;"><a href="https://servemasteracademy.ca/pricing" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Rejoin ServeMaster →</a></p><p style="font-size:15px;line-height:1.7;color:#a3a3a3;"><strong style="color:#f5f5f5;">Kirk</strong><br><a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#d4af37;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a></p><hr style="border:none;border-top:1px solid #333;margin:32px 0;"><p style="font-size:12px;color:#666;line-height:1.6;">ServeMaster Academy · <a href="https://servemasteracademy.ca" style="color:#666;">servemasteracademy.ca</a></p></div>`
    }).catch(err => console.error('Expired email error:', err.message));
  }
}

// ── User progress routes ──────────────────────────────────────────────────────
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
    const newStreak = last === yesterday ? s.current_streak + 1 : 1;
    const longest = Math.max(newStreak, s.longest_streak);
    await db.query('UPDATE streaks SET current_streak = $1, longest_streak = $2, last_activity_date = $3 WHERE user_id = $4', [newStreak, longest, today, userId]);
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

app.post('/api/user/progress', authMiddleware, checkTrial, async (req, res) => {
  const { moduleId, progress, quizScore } = req.body;
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
              <hr style="border:none;border-top:1px solid #333;margin:32px 0;">
              <p style="font-size:12px;color:#666;line-height:1.6;">ServeMaster Academy · <a href="https://servemasteracademy.ca" style="color:#666;">servemasteracademy.ca</a></p>
            </div>
          `
        }).catch(err => console.error('AI roleplay email error:', err.message));
      }
    }
    if (moduleId === 1 && progress >= 100 && !wasAlreadyComplete) {
      const uRes = await db.query('SELECT name, email FROM users WHERE id = $1', [req.user.id]);
      const u = uRes.rows[0];
      if (u) {
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
              <hr style="border:none;border-top:1px solid #333;margin:32px 0;">
              <p style="font-size:12px;color:#666;line-height:1.6;">ServeMaster Academy · <a href="https://servemasteracademy.ca" style="color:#666;">servemasteracademy.ca</a></p>
            </div>
          `
        }).catch(err => console.error('Module 2 email error:', err.message));
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
    { id:12, title:'Server Leadership & Career',                 titleFr:'Leadership & carrière en service',               titleEs:'Liderazgo del Mesero y Carrera Profesional', emoji:'⭐', mins:10 }
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
    if (completedModules >= 12) potentialBadges.push('module_master');
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

app.get('/api/leaderboard', async (req, res) => {
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
      LIMIT 20
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

app.post('/api/enterprise-request', contactLimiter, async (req, res) => {
  const { name, email, company, locations, message } = req.body;
  if (!name || !email || !company) return res.status(400).json({ error: 'Name, email and company are required' });
  try {
    const fullMessage = `Company: ${company}\nLocations: ${locations || 'Not specified'}\n\n${message || ''}`.trim();
    await db.query('INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3)', [name, email.toLowerCase(), `[ENTERPRISE] ${fullMessage}`]);
    if (mailer) {
      await mailer.sendMail({
        from: `"ServeMaster Academy" <${HELLO_EMAIL}>`,
        to: ADMIN_EMAIL,
        subject: `Enterprise Inquiry from ${company} — ${name}`,
        text: `New enterprise request:\n\nName: ${name}\nEmail: ${email}\nCompany: ${company}\nLocations: ${locations || 'Not specified'}\n\nMessage:\n${message || 'No message provided'}`,
        html: `<h2>New Enterprise Inquiry</h2><table style="font-family:sans-serif;font-size:14px"><tr><td><b>Name</b></td><td>${escapeHtml(name)}</td></tr><tr><td><b>Email</b></td><td>${escapeHtml(email)}</td></tr><tr><td><b>Company</b></td><td>${escapeHtml(company)}</td></tr><tr><td><b>Locations</b></td><td>${escapeHtml(locations || 'Not specified')}</td></tr></table><p><b>Message:</b><br>${escapeHtml(message || 'No message provided').replace(/\n/g, '<br>')}</p>`
      });
    } else {
      console.log(`[Enterprise request — no SMTP] ${name} <${email}> | ${company} | ${locations}`);
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
    if (!user || user.role !== 'manager') return res.status(403).json({ error: 'Manager access only' });
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

app.get('/api/manager/staff/:id', authMiddleware, async (req, res) => {
  try {
    const userRes = await db.query('SELECT restaurant_id, role FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];
    if (!user || user.role !== 'manager') return res.status(403).json({ error: 'Manager access only' });
    const staffRes = await db.query('SELECT id, name, email, experience_level, last_login FROM users WHERE id = $1 AND restaurant_id = $2', [req.params.id, user.restaurant_id]);
    if (!staffRes.rows.length) return res.status(404).json({ error: 'Staff member not found' });
    const progressRes = await db.query('SELECT module_id, progress, quiz_score, completed_at FROM user_progress WHERE user_id = $1', [req.params.id]);
    const scenarioRes = await db.query('SELECT scenario_id, completed_at FROM scenario_scores WHERE user_id = $1', [req.params.id]);
    const badgeRes = await db.query('SELECT badge_id, earned_at FROM badges WHERE user_id = $1', [req.params.id]);
    res.json({ staff: staffRes.rows[0], progress: progressRes.rows, scenarios: scenarioRes.rows, badges: badgeRes.rows });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch staff details' }); }
});

// ── Stripe payment routes ─────────────────────────────────────────────────────
app.post('/api/payments/create-checkout', authMiddleware, async (req, res) => {
  const { plan } = req.body;
  const priceMap = {
    premium_monthly: STRIPE_PREMIUM_MONTHLY_ID,
    premium_annual:  STRIPE_PREMIUM_ANNUAL_ID,
    starter_team:    STRIPE_STARTER_TEAM_ID,
    pro_team:        STRIPE_PRO_TEAM_ID,
  };
  const priceId = priceMap[plan];
  if (!priceId) return res.status(400).json({ error: 'Invalid plan' });
  const isTeamPlan = plan === 'starter_team' || plan === 'pro_team';
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
      for (const pc of pendingCredits.rows) {
        try {
          await stripe.customers.createBalanceTransaction(customerId, {
            amount: -5000, currency: 'cad',
            description: 'Referral credit — thank you for inviting a manager!'
          });
          await db.query('UPDATE referrals SET status = $1, credited_at = NOW() WHERE id = $2', ['credited', pc.id]);
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
          console.error('Deferred credit apply error:', creditErr.message);
        }
      }
    }
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const metadata = { plan, userId: String(user.id) };
    if (isTeamPlan && user.restaurant_id) metadata.restaurantId = String(user.restaurant_id);
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      metadata,
      success_url: 'https://servemasteracademy.ca/success.html',
      cancel_url: 'https://servemasteracademy.ca',
    });
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
    const customerId = result.rows[0]?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ error: 'No billing account found. You may be on a free plan.' });
    const stripe = await getUncachableStripeClient();
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
        COALESCE(SUM(p.progress)/12, 0) as avg_progress,
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
    const { plan = 'premium', maxUses = 1, expiresAt } = req.body;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const code = `SMA-${part()}-${part()}`;
    await db.query(
      'INSERT INTO invite_codes (code, plan, max_uses, expires_at, created_by) VALUES ($1, $2, $3, $4, $5)',
      [code, plan, maxUses === 0 ? 999999 : maxUses, expiresAt || null, req.user.id]
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
        html: emailShell(`${p(`Hi ${name},`)}${p("Your 14-day free trial ends in just 4 days.")}${p("If you're enjoying the training and want to keep access to all 12 modules, the AI role-play, and the manager dashboard, now is a great time to upgrade.")}${p('Use code <strong style="color:#d4af37;font-size:18px;letter-spacing:1px;">LAUNCH20</strong> for 20% off your first month.')}${btn("Upgrade Now", "https://servemasteracademy.ca/pricing")}${sig}`)
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
    await db.query(
      'UPDATE users SET subscription_status = $1, is_trial_active = false, trial_ends_at = NULL WHERE id = $2',
      [ic.plan, req.user.id]
    );
    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];
    const restaurant = user.restaurant_id ? (await db.query('SELECT * FROM restaurants WHERE id = $1', [user.restaurant_id])).rows[0] : null;
    const effective_plan = highestPlan(user.subscription_status, restaurant?.plan);
    res.json({ ok: true, plan: ic.plan, effective_plan });
  } catch (err) { res.status(500).json({ error: 'Failed to redeem invite code' }); }
});

// ── AI routes ─────────────────────────────────────────────────────────────────
app.post('/api/transcribe', authMiddleware, aiLimiter, upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file provided' });
  try {
    const audioFile = await toFile(req.file.buffer, 'audio.webm', { type: req.file.mimetype || 'audio/webm' });
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
  7: { title: 'Splitting the Bill', systemPrompt: `You are the organiser of a group of 7 friends who have finished dinner. The group wants to split the bill in a complicated way — some people want to pay only for what they ordered, two people want to split equally, and one person wants to pay separately. The user is playing the server handling the bill. React naturally — be apologetic about the complexity, but firm in how you want it split.` },
  8: { title: 'VIP Guest Arrival', systemPrompt: `You are a well-known local businessperson arriving at the restaurant. You are polite but expect exceptional service and have high standards. You have a reservation but your preferred table isn't ready. You notice small details — a slightly sticky menu, a water glass with spots. The user is playing the server who must meet these high expectations gracefully. Compliment good service genuinely.` },
  9: { title: 'The Indecisive Guest', systemPrompt: `You are a guest who cannot make up their mind. You ask lots of questions about every dish, compare options repeatedly, and keep changing your mind. You are friendly but take a long time to decide. The user is playing the server who must guide you to a decision without making you feel rushed. Respond warmly to patient, helpful guidance.` },
  10: { title: 'Wrong Order Delivered', systemPrompt: `You are a guest who has just been served the wrong dish. You ordered the salmon but received the chicken. You are not aggressive, but clearly disappointed — you specifically ordered the salmon because you don't eat red meat (though you're not strictly vegetarian). The user is playing the server who must handle the mistake. React authentically — a genuine, swift apology with fast action will win you over; excuses will frustrate you further.` },
  11: { title: 'Premium Wine Decanting', systemPrompt: `You are a sophisticated wine connoisseur who has ordered a 2015 Barolo. You expect proper tableside decanting service. You are not rude, but very knowledgeable and you will notice any mistakes in the decanting process — incorrect pour angle, not checking the sediment, not presenting the label. The user is playing the server performing the decanting. Be impressed by correct technique and gently raise questions if they seem uncertain.` },
  12: { title: 'Large Group Chaos', systemPrompt: `You are the organiser of a party of 16 for a corporate team dinner. Half the group has dietary restrictions, three people are late, and two have changed their pre-orders. You are stressed but trying to be reasonable. The user is playing the server managing this group. React positively to calm, organised handling and negatively to panic or poor communication.` },
  13: { title: 'Severe Allergy Emergency', systemPrompt: `You are a guest who, despite clear warnings given during booking, has just discovered your dish may contain traces of your severe shellfish allergy (you carry an EpiPen). You are frightened but trying to stay calm. The user is playing the server who must handle this as a genuine emergency — not just an inconvenience. If they minimise it or seem unsure, your anxiety escalates.` },
  14: { title: 'The Marriage Proposal', systemPrompt: `You are a nervous guest who pre-arranged with the restaurant to propose to your partner during dessert. The ring is with the manager, champagne is on ice, but the timing needs to be perfect. You are communicating with the server to coordinate. Your partner must NOT suspect anything. The user is playing the server who must execute this flawlessly while acting natural in front of the partner.` },
  15: { title: 'Corporate Expense Dinner', systemPrompt: `You are a CFO hosting a client dinner. You need itemised receipts, the bill split into two separate company accounts, confirmation of the restaurant's VAT number, and you have a dietary requirement not mentioned in the booking. You are professional but demanding and time-conscious. The user is playing the server who must handle this efficiently.` },
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
  30: { title: 'Bisected Language Table', systemPrompt: `You are the leader of a table where 4 guests speak only French and 4 guests speak only English. You speak both. You are relaying orders but getting confused, and the non-English speakers are pointing at the menu looking confused. The user is playing the server who must serve this table with grace — using you as translator when needed, using visual menus, adapting their communication style.` }
};

app.post('/api/roleplay', authMiddleware, aiLimiter, async (req, res) => {
  const { scenarioId, messages, lang } = req.body;
  const scenario = scenarios[scenarioId];
  if (!scenario) return res.status(400).json({ error: 'Invalid scenario' });
  const thirdPersonWrapper = lang === 'fr'
    ? `STYLE DE NARRATION — IMPORTANT : Narrez toujours le client à la troisième personne. Ne parlez jamais en tant que client à la première personne. Décrivez ce que dit et fait le client comme un narrateur : "Le client fronce les sourcils et dit : '...'". Utilisez "le client", "il", "elle" ou "ils" tout au long. Décrivez le langage corporel et le ton en parallèle du dialogue.\n\n`
    : lang === 'es'
    ? `ESTILO DE NARRACIÓN — IMPORTANTE: Narra siempre al cliente en tercera persona. Nunca hables como el cliente en primera persona. Describe lo que dice y hace el cliente como narrador: "El cliente frunce el ceño y dice: '...'". Usa "el cliente", "él", "ella" o "ellos" en todo momento. Describe el lenguaje corporal y el tono junto al diálogo.\n\n`
    : `NARRATION STYLE — IMPORTANT: Always narrate the customer in third person. Never speak as the customer in first person ("I want...", "I'm angry..."). Instead, describe what the customer says and does as a narrator: "The customer frowns and says: '...'", "He crosses his arms and replies: '...'", "She sighs and asks: '...'". Use "the customer", "he", "she", or "they" throughout. Describe body language and tone alongside dialogue.\n\n`;
  const langInstruction = lang === 'fr'
    ? '\n\nIMPORTANT : Cette conversation se déroule en français. Tu DOIS répondre entièrement en français.'
    : lang === 'es'
    ? '\n\nIMPORTANTE: Esta conversación ocurre en español. DEBES responder completamente en español.'
    : '';
  const systemContent = thirdPersonWrapper + scenario.systemPrompt + langInstruction;
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
    ? '\n\nIMPORTANT : Rédige toute ta réponse en français.'
    : lang === 'es'
    ? '\n\nIMPORTANTE: Escribe toda tu respuesta en español.'
    : '';
  const systemPrompt = `You are a strict, experienced fine-dining hospitality trainer reviewing a server's performance in a roleplay exercise.

Scenario: "${scenario.title}"

You will be given the full conversation between the server (user) and the simulated customer (assistant). Review what the server actually said — their word choices, tone, phrasing, and actions — and provide a structured critique.

RULES:
- Be direct and specific. Reference exactly what the server said or failed to say.
- Do NOT retell or summarise the scenario plot.
- Do NOT be vague. "Good empathy" is not acceptable — say "You acknowledged the wait with 'I completely understand your frustration' which was the right move."
- Identify real mistakes, missed upsell moments, poor phrasing, or protocol gaps.
- If the server did something wrong, say so clearly.
- Keep each bullet point to one concrete observation.

Respond with valid JSON only, in this exact format:
{
  "verdict": "One direct sentence summarising overall performance — honest, not flattering",
  "right": ["Specific strength referencing what was said", "Another strength if applicable"],
  "wrong": ["Specific mistake or missed opportunity referencing actual dialogue", "Another gap if applicable"],
  "tip": "One concrete, actionable coaching tip for what to do differently or better next time"
}` + langInstruction;
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
  10: 'POS & Billing', 11: 'Wine Service Advanced', 12: 'Floor Leadership'
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
      SELECT u.id, u.name, u.email,
        COALESCE(AVG(p.progress), 0) as avg_progress,
        (SELECT module_id FROM user_progress WHERE user_id = u.id ORDER BY progress DESC LIMIT 1) as strongest_module_id
      FROM users u
      LEFT JOIN user_progress p ON p.user_id = u.id
      ${whereClause}
      GROUP BY u.id, u.name, u.email
      ORDER BY avg_progress DESC
      LIMIT 100
    `, params);

    const team = staffRes.rows.map(member => ({
      id: member.id,
      name: member.name || member.email,
      progress: Math.round(Number(member.avg_progress)),
      strongest: MODULE_NAMES[member.strongest_module_id] || 'N/A',
      status: calculateStatus([Number(member.avg_progress)])
    }));

    res.json(team);
  } catch (err) {
    console.error('Team fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

// Issue certificate (marks all 12 modules as complete for a user)
app.post('/api/certificate', managerMiddleware, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const userRes = await db.query('SELECT id, name, email FROM users WHERE id = $1', [userId]);
    if (!userRes.rows.length) return res.status(404).json({ error: 'User not found' });
    const user = userRes.rows[0];

    for (let moduleId = 1; moduleId <= 12; moduleId++) {
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
      "UPDATE users SET role = 'admin', subscription_status = 'premium' WHERE email = $1 AND role != 'admin' RETURNING email",
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
  } catch (e) {}
  await initStripe();
});
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
