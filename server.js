require('./instrument'); // Sentry init — MUST be first, before express/http
const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
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
const puppeteer = require('puppeteer');
const db = require('./db');
const { parseArticles: _parseBlogArticles } = require('./lib/blogFreshness');
const { getChapter, getAllChapters } = require('./books/voice-map');
const { cleanForTTS, chunkForTTS } = require('./lib/bookCleaner');
const authRoutes = require('./routes/auth');
const createStripeRouter = require('./routes/stripe');
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');
const { logger } = require('./lib/logger');
// NOTE: COOKIE_OPTS is defined locally below (line ~165) and shared with lib/auth —
// do not import it from lib/auth here or Node will throw "already declared".

// Build a slug → { datePublished, dateModified } map once at startup.
// Used by the sitemap and blog JSON-LD routes so dates are always accurate.
let _blogDateMap = {};
try {
  const _contentSrc = fs.readFileSync(path.join(__dirname, 'public/js/content.js'), 'utf8');
  _parseBlogArticles(_contentSrc).forEach(({ slug, datePublished, dateModified }) => {
    _blogDateMap[slug] = { datePublished, dateModified };
  });
} catch (_e) { /* non-fatal: dates fall back gracefully */ }

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Shared email helpers (lib/emailHelpers.js) ────────────────────────────
const createEmailHelpers = require('./lib/emailHelpers');
const {
  escapeHtml, getTenantBrandingForEmail, sendTrialDripEmails,
  getOrCreateUnsubToken, emailFooter, sendDripEmailIfDue, sendWeeklyManagerDigests,
} = createEmailHelpers({ db, resend });

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
// Content Security Policy — allowlists the third-party origins the site actually
// uses (Stripe, Google Fonts/Tag Manager, ContentSquare, Tailwind/cdnjs/jsDelivr,
// YouTube). 'unsafe-inline'/'unsafe-eval' are required: the marketing pages and
// SPAs rely on inline scripts/handlers and the Tailwind Play CDN evaluates code at
// runtime. upgrade-insecure-requests is production-only so local http dev isn't broken.
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      scriptSrc: [
        "'self'", "'unsafe-inline'", "'unsafe-eval'",
        'https://cdn.tailwindcss.com',
        'https://cdnjs.cloudflare.com',
        'https://cdn.jsdelivr.net',
        'https://js.stripe.com',
        'https://www.googletagmanager.com',
        'https://t.contentsquare.net',
      ],
      // The marketing pages + dashboards use ~500 inline on*= handler attributes;
      // helmet's default script-src-attr 'none' would block every one of them.
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: [
        "'self'", "'unsafe-inline'",
        'https://fonts.googleapis.com',
        'https://cdnjs.cloudflare.com',
        'https://cdn.jsdelivr.net',
      ],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: [
        "'self'",
        'https://api.stripe.com',
        'https://r.stripe.com',
        'https://m.stripe.network',
        'https://www.googletagmanager.com',
        'https://www.google-analytics.com',
        'https://region1.google-analytics.com',
        'https://t.contentsquare.net',
        'https://*.contentsquare.net',
      ],
      frameSrc: [
        "'self'",
        'https://js.stripe.com',
        'https://hooks.stripe.com',
        'https://www.youtube.com',
        'https://www.youtube-nocookie.com',
      ],
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      workerSrc: ["'self'", 'blob:'],
      manifestSrc: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
}));
// Prevent crawlers from indexing API routes — stops OAuth redirect chains
// and API endpoints from being flagged as exposed secrets by scanners
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.use(compression());
app.use(requestLogger); // structured per-request logging + X-Request-Id correlation
app.use(cookieParser());
app.use('/auth', authRoutes); // Google OAuth (credential flow) + logout — see routes/auth.js
// Force JS files to revalidate on every load so browser updates are never missed
app.use(function (req, res, next) {
  if (req.path.endsWith('.js')) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  }
  next();
});
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
// Normalise trailing slashes: redirect /foo/ → /foo (301) so canonical URLs
// are consistent and express.static doesn't create a redirect chain for
// directory-mapped routes like /blog → /blog/.
app.use((req, res, next) => {
  if (req.path.length > 1 && req.path.endsWith('/')) {
    const qs = req.url.slice(req.path.length);
    return res.redirect(301, req.path.slice(0, -1) + qs);
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { redirect: false }));

// Proxy /__mockup/ to the mockup sandbox Vite dev server on port 23636
app.use('/__mockup', (req, res) => {
  const options = {
    hostname: '127.0.0.1',
    port: 23636,
    path: '/__mockup' + req.url,
    method: req.method,
    headers: { ...req.headers, host: 'localhost:23636' }
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on('error', () => res.status(502).end());
  req.pipe(proxyReq, { end: true });
});

// Helper to proxy WebSocket upgrades for /__mockup/ (needed for Vite HMR)
function attachMockupWsProxy(httpServer) {
  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url || !req.url.startsWith('/__mockup/')) return;
    const net = require('net');
    const target = net.createConnection({ host: '127.0.0.1', port: 23636 }, () => {
      target.write(
        `${req.method} ${req.url} HTTP/1.1\r\n` +
        Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
        '\r\n\r\n'
      );
      target.write(head);
      socket.pipe(target);
      target.pipe(socket);
    });
    target.on('error', () => socket.destroy());
    socket.on('error', () => target.destroy());
  });
}

if (!process.env.JWT_SECRET) throw new Error('FATAL: JWT_SECRET env var is not set. Server cannot start securely.');
const JWT_SECRET = process.env.JWT_SECRET;

(function smokeTestEnv() {
  const critical = [
    { key: 'GOOGLE_CLIENT_ID',              feature: 'Google sign-in' },
    { key: 'GOOGLE_CLIENT_SECRET',          feature: 'Google sign-in' },
    { key: 'STRIPE_PREMIUM_MONTHLY_ID',     feature: 'individual monthly checkout' },
    { key: 'STRIPE_PREMIUM_ANNUAL_ID',      feature: 'individual annual checkout' },
    { key: 'STRIPE_STARTER_TEAM_ANNUAL_ID', feature: 'Starter Team annual checkout' },
    { key: 'STRIPE_PRO_TEAM_ANNUAL_ID',     feature: 'Pro Team annual checkout' },
    { key: 'STRIPE_WEBHOOK_SECRET',         feature: 'Stripe webhook payment events (subscription activations, cancellations, upgrades)' },
  ];
  const missing = critical.filter(({ key }) => !String(process.env[key] || '').trim());
  if (missing.length) {
    console.warn('');
    console.warn('⚠️  SMOKE-TEST WARNING — the following env vars are not set:');
    missing.forEach(({ key, feature }) =>
      console.warn(`   • ${key}  →  "${feature}" will be broken`)
    );
    console.warn('   Set these secrets before going live to avoid silent checkout / sign-in failures.');
    console.warn('');
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Missing critical env vars in production — see warnings above. Server cannot start safely.');
    }
  }
})();

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
const APP_URL = (process.env.APP_URL || 'http://localhost:5000').replace(/\/$/, '');
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@servemasteracademy.ca';
const FROM_EMAIL = process.env.FROM_EMAIL || 'kirk_adamson@servemasteracademy.ca';
const BRAND_NAME = process.env.BRAND_NAME || 'ServeMaster Academy';
const BRAND_LOGO_URL = process.env.BRAND_LOGO_URL || `${APP_URL}/logo.png`;

const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE_OPTS = { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax', secure: IS_PROD };


const PLAN_TIER_ORDER = ['free', 'premium_monthly', 'premium', 'starter_team', 'pro_team', 'enterprise'];
const PAID_PLAN_STATUSES = new Set(['premium_monthly', 'premium', 'individual', 'starter_team', 'pro_team', 'enterprise', 'active']);
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

const AFFILIATE_PLAN_PRICES_CAD = {
  premium: 19, premium_monthly: 19, premium_annual: 149,
  starter_team: 99, starter_team_annual: 990,
  pro_team: 199, pro_team_annual: 1990,
};
const AFFILIATE_RATES = {
  premium: 0.25, premium_monthly: 0.25, premium_annual: 0.25,
  starter_team: 0.30, starter_team_annual: 0.30,
  pro_team: 0.30, pro_team_annual: 0.30,
};
const AFFILIATE_TEAM_PLANS = new Set(['starter_team','starter_team_annual','pro_team','pro_team_annual']);
const AFFILIATE_ACTIVATION_BONUS = 75;

const WELCOME_BONUS_CAD = 100;

async function maybeGrantWelcomeBonus(influencer, triggeringUserId) {
  // Primary dedup guard — set atomically when the bonus is first created
  if (influencer.welcome_bonus_granted_at) return;
  // Confirm this is exactly the first qualified (non-blocked/reversed) sale commission
  const saleCount = await db.query(
    `SELECT COUNT(*) AS cnt FROM influencer_commissions
     WHERE influencer_id = $1 AND commission_type = 'sale' AND status NOT IN ('blocked','reversed')`,
    [influencer.id]
  );
  if (parseInt(saleCount.rows[0].cnt) !== 1) return;
  try {
    await db.query(
      `INSERT INTO influencer_commissions
         (influencer_id, user_id, commission_type, plan_type, amount_cad, commission_rate, months_applied, activation_bonus, eligible_at)
       VALUES ($1, $2, 'welcome_bonus', 'welcome_bonus', $3, 0, 1, 0, NOW() + INTERVAL '14 days')`,
      [influencer.id, triggeringUserId, WELCOME_BONUS_CAD]
    );
    await db.query(`UPDATE influencers SET welcome_bonus_granted_at = NOW() WHERE id = $1`, [influencer.id]);
    console.log(`Welcome bonus ($${WELCOME_BONUS_CAD} CAD) granted for influencer ${influencer.id} (triggered by user ${triggeringUserId})`);
    resend.emails.send({
      from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
      to: influencer.email,
      subject: `🎉 You've earned your $${WELCOME_BONUS_CAD} first-sale welcome bonus — ServeMaster Academy`,
      html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(influencer.name)},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Congratulations on your <strong>first qualified sale</strong>! You've unlocked a one-time welcome bonus:</p><div style="background:#1a1a1a;border:2px solid #FF5E3A;border-radius:12px;padding:20px;text-align:center;margin:24px 0;"><p style="font-size:13px;color:#a3a3a3;margin:0 0 8px;">First-Sale Welcome Bonus</p><p style="font-size:40px;font-weight:700;color:#FF5E3A;margin:0;">$${WELCOME_BONUS_CAD} CAD</p></div><p style="font-size:15px;color:#a3a3a3;line-height:1.7;">This bonus is subject to the standard 14-day hold and will appear in your next eligible payout alongside your commission earnings. It won't be awarded again — it's a one-time reward for making your first sale.</p><p style="font-size:15px;color:#a3a3a3;line-height:1.7;margin-top:12px;">Keep sharing — every new subscriber earns you more.</p><p style="font-size:16px;line-height:1.7;margin-top:32px;color:#a3a3a3;"><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy</p></div>`
    }).catch(e => console.error('Welcome bonus email error:', e.message));
  } catch (e) {
    if (e.code === '23505') {
      // Unique index violation — bonus already exists; safe to ignore
      console.warn(`Welcome bonus already exists for influencer ${influencer.id}, skipping.`);
    } else {
      console.error('maybeGrantWelcomeBonus error:', e.message);
    }
  }
}

async function processInfluencerCommission(user, plan) {
  if (!user.influencer_ref_code) return;
  const price = AFFILIATE_PLAN_PRICES_CAD[plan];
  const rate = AFFILIATE_RATES[plan];
  if (!price || !rate) return;
  const inf = await db.query(
    `SELECT id, name, email, welcome_bonus_granted_at FROM influencers WHERE ref_code = $1 AND status = 'approved'`,
    [user.influencer_ref_code]
  );
  if (!inf.rows.length) return;
  const influencer = inf.rows[0];
  // Scholarship restriction: if the influencer is a current scholarship recipient,
  // skip commission until their 60-day scholarship period has ended
  const schCheck = await db.query(
    `SELECT invite_access_expires_at FROM users WHERE email = $1 AND invite_access_expires_at > NOW()`,
    [influencer.email]
  );
  if (schCheck.rows.length) {
    const expiresAt = schCheck.rows[0].invite_access_expires_at;
    console.log(`Commission skipped: affiliate ${influencer.id} (${influencer.email}) has active scholarship until ${expiresAt}`);
    return;
  }
  // Deduplicate: only one sale commission per user
  const existing = await db.query(
    `SELECT id FROM influencer_commissions WHERE user_id = $1 AND commission_type = 'sale'`,
    [user.id]
  );
  if (existing.rows.length) return;
  const amount = parseFloat((price * rate).toFixed(2));
  const isTeam = AFFILIATE_TEAM_PLANS.has(plan);
  const prevTeam = isTeam
    ? await db.query(
        `SELECT id FROM influencer_commissions WHERE influencer_id = $1 AND plan_type = ANY($2) AND commission_type = 'sale'`,
        [influencer.id, Array.from(AFFILIATE_TEAM_PLANS)]
      )
    : { rows: [1] };
  const activationBonus = isTeam && !prevTeam.rows.length ? AFFILIATE_ACTIVATION_BONUS : 0;
  await db.query(
    `INSERT INTO influencer_commissions
       (influencer_id, user_id, commission_type, plan_type, amount_cad, commission_rate, months_applied, activation_bonus, eligible_at)
     VALUES ($1, $2, 'sale', $3, $4, $5, 1, $6, NOW() + INTERVAL '14 days')`,
    [influencer.id, user.id, plan, amount, rate, activationBonus]
  );
  // Check and grant the one-time $100 welcome bonus after first qualifying sale
  await maybeGrantWelcomeBonus(influencer, user.id);
  const totalEarned = amount + activationBonus;
  const bonusLine = activationBonus > 0
    ? `<div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:12px 16px;margin-top:8px;font-size:13px;color:#a3a3a3;">+<strong style="color:#f5f5f5;">$${activationBonus} CAD</strong> one-time Team Plan activation bonus included</div>`
    : '';
  resend.emails.send({
    from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
    to: influencer.email,
    subject: `New conversion — $${totalEarned} CAD commission earned`,
    html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(influencer.name)},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Great news — someone who clicked your ServeMaster Academy link just subscribed to the <strong style="color:#FF5E3A;">${escapeHtml(plan.replace(/_/g,' '))}</strong> plan.</p><div style="background:#1a1a1a;border:2px solid #FF5E3A;border-radius:12px;padding:20px;text-align:center;margin:24px 0;"><p style="font-size:13px;color:#a3a3a3;margin:0 0 8px;">Commission Earned (${Math.round(rate * 100)}% of $${price})</p><p style="font-size:32px;font-weight:700;color:#FF5E3A;margin:0;">$${amount} CAD</p></div>${bonusLine}<p style="font-size:15px;color:#a3a3a3;line-height:1.7;margin-top:16px;">This will be included in your next monthly payout summary. Payouts are processed on the 1st of each month (minimum $50, via PayPal, Wise, or bank transfer).</p><p style="font-size:16px;line-height:1.7;margin-top:32px;color:#a3a3a3;"><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy</p></div>`
  }).catch(e => console.error('Influencer commission email error:', e.message));
}

// ── Payout eligibility promotion ─────────────────────────────────────────────
async function promoteEligibleCommissions() {
  try {
    const result = await db.query(
      `UPDATE influencer_commissions
       SET status = 'payout_ready'
       WHERE status = 'pending' AND eligible_at IS NOT NULL AND eligible_at <= NOW()
       RETURNING id, influencer_id, amount_cad, activation_bonus`
    );
    if (result.rows.length > 0) {
      console.log(`Payout eligibility: promoted ${result.rows.length} commission(s) to payout_ready`);
    }
  } catch (e) { console.error('promoteEligibleCommissions error:', e.message); }
}
// Scheduled every 6 hours; initial run triggered after schema additions complete
setInterval(promoteEligibleCommissions, 6 * 60 * 60 * 1000);

// ── Hourly books-branch sync ───────────────────────────────────────────────────
async function runBooksSyncCron() {
  try {
    const { syncBooks } = require('./scripts/sync-books');
    const result = await syncBooks();
    if (result.inserted || result.updated) console.log(`Books cron sync: ${result.inserted} inserted, ${result.updated} updated`);
  } catch (e) { console.error('Books cron error:', e.message); }
}
setInterval(runBooksSyncCron, 60 * 60 * 1000);

// ── Daily trial drip email cron ───────────────────────────────────────────────
async function runDailyDripCron() {
  try {
    const users = await db.query(`
      SELECT id, email, name FROM users
      WHERE is_trial_active = TRUE
        AND trial_ends_at > NOW()
        AND (subscription_status IS NULL OR subscription_status = 'free')
        AND (is_unsubscribed IS NULL OR is_unsubscribed = FALSE)
        AND created_at > NOW() - INTERVAL '20 days'
    `);
    let sent = 0;
    for (const user of users.rows) {
      await sendDripEmailIfDue(user.id, user.email, user.name).catch(e => console.error(`Daily drip error for ${user.email}:`, e.message));
      sent++;
    }
    if (sent > 0) console.log(`Daily drip cron: checked ${sent} active trial users`);
  } catch (e) { console.error('Daily drip cron error:', e.message); }
}
setInterval(runDailyDripCron, 24 * 60 * 60 * 1000);
setTimeout(runDailyDripCron, 10 * 1000);

// ── Stripe routes (mounted BEFORE express.json — webhook requires raw body) ────
// Routes: POST /api/stripe/webhook, GET /api/stripe/publishable-key,
//         POST /api/payments/create-checkout, GET /api/payments/cancel,
//         POST /api/payments/billing-portal, GET /api/payments/status
// See routes/stripe.js
app.use('/api', createStripeRouter({
  resend,
  authMiddleware,
  processReferralCredit,
  processInfluencerCommission,
  escapeHtml,
  highestPlan,
}));

const createManagerRouter = require('./routes/manager');
app.use(createManagerRouter({
  resend,
  authMiddleware,
  escapeHtml,
  getTenantBrandingForEmail,
  getOrCreateUnsubToken,
  emailFooter,
}));

const createAdminRouter = require('./routes/admin');
const { router: adminRouter, sendOpenClawWeeklyDigest, sendKirkTrialDigest } = createAdminRouter({
  db, resend, escapeHtml, getUncachableStripeClient,
  sendWeeklyManagerDigests, APP_URL, ADMIN_EMAIL, jwt, JWT_SECRET,
});
app.use(adminRouter);

const startCronJobs = require('./lib/cronJobs');
startCronJobs({ db, sendOpenClawWeeklyDigest, sendKirkTrialDigest, sendWeeklyManagerDigests });

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// ── User + Contact routers (require parsed JSON body) ─────────────────────────
const createUserRouter = require('./routes/user');
app.use(createUserRouter({ db, getUncachableStripeClient, resend, upload, toFile, getOpenAI, getWhisper, getTTS, authMiddleware, checkTrial, aiLimiter, progressLimiter, escapeHtml, getOrCreateUnsubToken, emailFooter }));

const createContactRouter = require('./routes/contact');
app.use(createContactRouter({ db, resend, authMiddleware, contactLimiter, escapeHtml, highestPlan, ADMIN_EMAIL }));

const createCurriculumRouter = require('./routes/curriculum');
app.use(createCurriculumRouter({ db, getGrok, adminMiddleware }));

const createFeaturesRouter = require('./routes/features');
app.use(createFeaturesRouter({ db, resend, authMiddleware, escapeHtml, ADMIN_EMAIL, getUncachableStripeClient }));

const createAuthEmailRouter = require('./routes/auth-email');
app.use(createAuthEmailRouter({
  db, resend, bcrypt, jwt, JWT_SECRET, COOKIE_OPTS,
  ADMIN_EMAIL, APP_URL, FROM_EMAIL,
  authLimiter, authMiddleware,
  escapeHtml, getTenantBrandingForEmail,
  sendTrialDripEmails, sendDripEmailIfDue, updateStreak,
  getOrCreateUnsubToken, emailFooter,
  highestPlan,
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
}));

// ── Streak helper (used by auth/login and google callback) ─────────────────────
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

// ── Auth middleware ────────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

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
    next(Object.assign(e, { publicMessage: 'Server error' }));
  }
}

const requirePaidAccess = async (req, res, next) => {
  const token = req.cookies.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.redirect('/login');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.redirect('/login');
  }
  try {
    const { rows } = await db.query(
      'SELECT subscription_status, trial_ends_at, invite_access_expires_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows.length) return res.redirect('/login');
    const user = rows[0];
    const now = new Date();
    if (user.invite_access_expires_at && now <= new Date(user.invite_access_expires_at)) return next();
    if (PAID_PLAN_STATUSES.has(user.subscription_status)) return next();
    if (user.trial_ends_at && now <= new Date(user.trial_ends_at)) return next();
    return res.redirect('/app/upgrade');
  } catch (e) {
    console.error('requirePaidAccess error:', e.message);
    return res.redirect('/app/upgrade');
  }
};

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
    next(Object.assign(err, { publicMessage: 'Server error' }));
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
app.get('/sitemap.xml', (req, res) => {
  const base = APP_URL;
  // Static marketing pages — lastmod reflects actual content age, not today.
  // Using "today" on every request erodes Google's freshness trust.
  const staticPages = [
    ['/', '2026-05-01', '1.0', 'weekly'],
    ['/features', '2026-04-01', '0.9', 'monthly'],
    ['/pricing', '2026-04-01', '0.9', 'monthly'],
    ['/about', '2026-01-01', '0.7', 'monthly'],
    ['/contact', '2026-01-01', '0.6', 'monthly'],
    ['/ai-roleplay', '2026-03-01', '0.8', 'monthly'],
    ['/managers', '2026-03-01', '0.8', 'monthly'],
    ['/teams', '2026-03-01', '0.8', 'monthly'],
    ['/demo', '2026-05-24', '0.8', 'monthly'],
    ['/checklist', '2026-05-24', '0.8', 'monthly'],
    ['/scholarship', '2026-02-01', '0.8', 'monthly'],
    ['/affiliates', '2026-03-01', '0.7', 'monthly'],
    ['/novels', '2026-05-22', '0.8', 'monthly'],
    ['/novels/first-crossings', '2026-05-22', '0.8', 'monthly'],
    ['/blog', '2026-05-01', '0.8', 'weekly'],
  ];
  let blogUrls = '';
  try {
    const blogDir = path.join(__dirname, 'public', 'blog');
    const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.html') && f !== 'index.html' && f !== 'article.html');
    const enUrls = files.map(f => {
      const slug = f.replace('.html', '');
      const lastmod = (_blogDateMap[slug] && _blogDateMap[slug].dateModified) || '2025-01-01';
      return `  <url><loc>${base}/blog/${slug}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`;
    });
    const frDir = path.join(blogDir, 'fr');
    let frUrls = [];
    try {
      const frFiles = fs.readdirSync(frDir).filter(f => f.endsWith('.html'));
      frUrls = frFiles.map(f => {
        const slug = f.replace('.html', '');
        const lastmod = (_blogDateMap[slug] && _blogDateMap[slug].dateModified) || '2025-01-01';
        return `  <url><loc>${base}/blog/fr/${slug}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>`;
      });
    } catch (fe) { /* skip */ }
    const esDir = path.join(__dirname, 'public', 'blog', 'es');
    let esUrls = [];
    try {
      const esFiles = fs.readdirSync(esDir).filter(f => f.endsWith('.html'));
      esUrls = esFiles.map(f => {
        const slug = f.replace('.html', '');
        const lastmod = (_blogDateMap[slug] && _blogDateMap[slug].dateModified) || '2025-01-01';
        return `  <url><loc>${base}/blog/es/${slug}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>`;
      });
    } catch (ee) { /* skip */ }
    blogUrls = [...enUrls, ...frUrls, ...esUrls].join('\n');
  } catch (e) { /* skip */ }
  const staticUrls = staticPages.map(([p, lastmod, pri, freq]) =>
    `  <url><loc>${base}${p}</loc><lastmod>${lastmod}</lastmod><changefreq>${freq}</changefreq><priority>${pri}</priority></url>`
  ).join('\n');
  res.setHeader('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${staticUrls}\n${blogUrls}\n</urlset>`);
});

app.get('/novels', (req, res) => res.sendFile(path.join(__dirname, 'public', 'novels-series.html')));
app.get('/novels/first-crossings', (req, res) => res.sendFile(path.join(__dirname, 'public', 'novels-first-crossings.html')));
app.get('/novels/book-1', (req, res) => res.redirect(301, '/novels/first-crossings'));
app.get('/novels/eastern-sparks', (req, res) => res.sendFile(path.join(__dirname, 'public', 'novels-eastern-sparks.html')));
app.get('/novels/book-2', (req, res) => res.redirect(301, '/novels/eastern-sparks'));
app.get('/novels/southern-flames', (req, res) => res.sendFile(path.join(__dirname, 'public', 'novels-southern-flames.html')));
app.get('/novels/book-3', (req, res) => res.redirect(301, '/novels/southern-flames'));
app.get('/novels/the-table-we-built', (req, res) => res.sendFile(path.join(__dirname, 'public', 'novels-the-table-we-built.html')));
app.get('/novels/book-4', (req, res) => res.redirect(301, '/novels/the-table-we-built'));
app.get('/books/Novel1.pdf', (req, res) => {
  const pdfPath = path.join(__dirname, 'books', 'Covers - First Crossings.pdf');
  if (!fs.existsSync(pdfPath)) return res.status(404).send('PDF not yet available');
  res.download(pdfPath, 'Covers - First Crossings.pdf');
});
app.get('/books/Novel2.pdf', (req, res) => {
  const pdfPath = path.join(__dirname, 'books', 'Covers - Eastern Sparks.pdf');
  if (!fs.existsSync(pdfPath)) return res.status(404).send('PDF not yet available');
  res.download(pdfPath, 'Covers - Eastern Sparks.pdf');
});
app.get('/books/Novel3.pdf', (req, res) => {
  const pdfPath = path.join(__dirname, 'books', 'Covers - Southern Flames.pdf');
  if (!fs.existsSync(pdfPath)) return res.status(404).send('PDF not yet available');
  res.download(pdfPath, 'Covers - Southern Flames.pdf');
});
app.get('/books/Novel4.pdf', (req, res) => {
  const pdfPath = path.join(__dirname, 'books', 'Novel4.pdf');
  if (!fs.existsSync(pdfPath)) return res.status(404).send('PDF not yet available');
  res.download(pdfPath, 'The-Table-We-Built.pdf');
});
app.get('/features', (req, res) => res.sendFile(path.join(__dirname, 'public', 'features.html')));
app.get('/pricing', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pricing.html')));
app.get('/managers', (req, res) => res.sendFile(path.join(__dirname, 'public', 'managers.html')));
app.get('/teams', (req, res) => res.sendFile(path.join(__dirname, 'public', 'teams.html')));
app.get('/demo', (req, res) => res.sendFile(path.join(__dirname, 'public', 'demo.html')));
app.get('/checklist', (req, res) => res.sendFile(path.join(__dirname, 'public', 'checklist.html')));
app.get('/ai-roleplay', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ai-roleplay.html')));
app.get('/training', (req, res) => res.sendFile(path.join(__dirname, 'public', 'training.html')));
app.get('/app/training', requirePaidAccess, (req, res) => res.sendFile(path.join(__dirname, 'public', 'app-training.html')));
app.get('/manager-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'manager-dashboard.html')));
app.get('/blog', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog', 'index.html')));
app.get('/blog/fr', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog', 'fr', 'index.html')));
app.get('/blog/es', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog', 'es', 'index.html')));
app.get('/knowledge-center', (req, res) => res.redirect(301, '/blog'));
app.get('/blog/fr/:slug', (req, res, next) => {
  const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
  const filePath = path.join(__dirname, 'public', 'blog', 'fr', slug + '.html');
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) { res.redirect('/blog/' + slug); return; }
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    const pageTitle = titleMatch ? titleMatch[1].replace(/ [–—-] ServeMaster Academy$/, '').trim() : 'ServeMaster Academy';
    const pageDesc = descMatch ? descMatch[1] : '';
    const articleUrl = 'https://servemasteracademy.ca/blog/fr/' + slug;
    const _dates = _blogDateMap[slug];
    const datePublished = (_dates && _dates.datePublished) || '2025-01-01';
    const dateModified  = (_dates && _dates.dateModified)  || datePublished;
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: pageTitle,
      description: pageDesc,
      url: articleUrl,
      image: 'https://servemasteracademy.ca/logo.png',
      datePublished,
      dateModified,
        author: {
          '@type': 'Person',
          name: 'Kirk Adamson',
          url: 'https://ca.linkedin.com/in/kirk-adamson-6372a7193'
        },
        publisher: {
          '@type': 'Organization',
          name: 'ServeMaster Academy',
          url: 'https://servemasteracademy.ca',
          logo: { '@type': 'ImageObject', url: 'https://servemasteracademy.ca/logo.png' }
        }
      };
    const schemaTag = `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>\n`;
    const injected = html.replace('</head>', schemaTag + '</head>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(injected);
  });
});
app.get('/blog/es/:slug', (req, res, next) => {
  const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
  const filePath = path.join(__dirname, 'public', 'blog', 'es', slug + '.html');
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) { res.redirect('/blog/' + slug); return; }
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    const pageTitle = titleMatch ? titleMatch[1].replace(/ [–—-] ServeMaster Academy$/, '').trim() : 'ServeMaster Academy';
    const pageDesc = descMatch ? descMatch[1] : '';
    const articleUrl = 'https://servemasteracademy.ca/blog/es/' + slug;
    const _dates = _blogDateMap[slug];
    const datePublished = (_dates && _dates.datePublished) || '2025-01-01';
    const dateModified  = (_dates && _dates.dateModified)  || datePublished;
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: pageTitle,
      description: pageDesc,
      url: articleUrl,
      image: 'https://servemasteracademy.ca/logo.png',
      datePublished,
      dateModified,
        author: {
          '@type': 'Person',
          name: 'Kirk Adamson',
          url: 'https://ca.linkedin.com/in/kirk-adamson-6372a7193'
        },
        publisher: {
          '@type': 'Organization',
          name: 'ServeMaster Academy',
          url: 'https://servemasteracademy.ca',
          logo: { '@type': 'ImageObject', url: 'https://servemasteracademy.ca/logo.png' }
        }
      };
    const schemaTag = `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>\n`;
    const injected = html.replace('</head>', schemaTag + '</head>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(injected);
  });
});
app.get('/blog/:slug', (req, res, next) => {
  const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
  const filePath = path.join(__dirname, 'public', 'blog', slug + '.html');
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) {
      const templatePath = path.join(__dirname, 'public', 'blog', 'article.html');
      res.sendFile(templatePath, (err2) => { if (err2) next(); });
      return;
    }
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    const pageTitle = titleMatch ? titleMatch[1].replace(/ [–—-] ServeMaster Academy$/, '').trim() : 'ServeMaster Academy';
    const pageDesc = descMatch ? descMatch[1] : '';
    const articleUrl = 'https://servemasteracademy.ca/blog/' + slug;
    const _dates = _blogDateMap[slug];
    const datePublished = (_dates && _dates.datePublished) || '2025-01-01';
    const dateModified  = (_dates && _dates.dateModified)  || datePublished;
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: pageTitle,
      description: pageDesc,
      url: articleUrl,
      image: 'https://servemasteracademy.ca/logo.png',
      datePublished,
      dateModified,
        author: {
          '@type': 'Person',
          name: 'Kirk Adamson',
          url: 'https://ca.linkedin.com/in/kirk-adamson-6372a7193'
        },
        publisher: {
          '@type': 'Organization',
          name: 'ServeMaster Academy',
          url: 'https://servemasteracademy.ca',
          logo: { '@type': 'ImageObject', url: 'https://servemasteracademy.ca/logo.png' }
        }
      };
    const schemaTag = `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>\n`;
    const injected = html.replace('</head>', schemaTag + '</head>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(injected);
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
app.get('/verify/:token', (req, res) => res.sendFile(path.join(__dirname, 'public', 'verify.html')));
app.get('/scholarship', (req, res) => res.sendFile(path.join(__dirname, 'public', 'scholarship.html')));
app.get('/affiliates', (req, res) => res.sendFile(path.join(__dirname, 'public', 'affiliates.html')));

app.get('/r/:code', async (req, res) => {
  try {
    const code = (req.params.code || '').toLowerCase().trim();
    const inf = await db.query(`SELECT id FROM influencers WHERE ref_code = $1 AND status = 'approved'`, [code]);
    if (inf.rows.length) {
      res.cookie('sma_ref', code, { maxAge: 90 * 24 * 60 * 60 * 1000, httpOnly: false, sameSite: 'lax', secure: IS_PROD });
    }
  } catch (e) { console.error('Referral redirect error:', e.message); }
  res.redirect('/pricing');
});


app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

(async () => {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS training_plan_items (
      id SERIAL PRIMARY KEY,
      plan_id INT REFERENCES training_plans(id) ON DELETE CASCADE,
      module_id INT NOT NULL,
      position INT NOT NULL DEFAULT 0,
      due_date DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_training_plans_restaurant_user ON training_plans(restaurant_id, user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_training_plan_items_plan_pos ON training_plan_items(plan_id, position)`);
    await db.query(`CREATE TABLE IF NOT EXISTS scholarship_applications (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      motivation TEXT NOT NULL,
      years_experience TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      applied_at TIMESTAMPTZ DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      invite_code TEXT,
      grad_at TIMESTAMPTZ,
      testimonial TEXT,
      share_contact BOOLEAN DEFAULT FALSE
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scholarship_email ON scholarship_applications(email)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scholarship_status ON scholarship_applications(status)`);
    // ── White-label tenant branding columns ───────────────────────────────────
    await db.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS wl_brand_name TEXT`);
    await db.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS wl_logo_url TEXT`);
    await db.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS wl_primary_color VARCHAR(7)`);
    await db.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS wl_accent_color VARCHAR(7)`);
    await db.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS wl_is_active BOOLEAN NOT NULL DEFAULT FALSE`);
    await db.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS wl_is_enterprise BOOLEAN NOT NULL DEFAULT FALSE`);
    // ── Influencer / affiliate program ─────────────────────────────────────────
    await db.query(`CREATE TABLE IF NOT EXISTS influencers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL,
      handle TEXT NOT NULL,
      followers INT,
      audience_desc TEXT,
      ref_code TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_influencers_status ON influencers(status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_influencers_ref_code ON influencers(ref_code)`);
    await db.query(`CREATE TABLE IF NOT EXISTS influencer_commissions (
      id SERIAL PRIMARY KEY,
      influencer_id INT NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_type TEXT NOT NULL,
      amount_cad NUMERIC(8,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payment_ref TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      paid_at TIMESTAMPTZ
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_inf_commissions_influencer ON influencer_commissions(influencer_id)`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_inf_commissions_user ON influencer_commissions(user_id)`);
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS influencer_ref_code TEXT`);
    await db.query(`ALTER TABLE influencers ADD COLUMN IF NOT EXISTS website TEXT`);
    await db.query(`ALTER TABLE influencers ADD COLUMN IF NOT EXISTS pref_language TEXT DEFAULT 'en'`);
    await db.query(`ALTER TABLE influencers ADD COLUMN IF NOT EXISTS pref_payout_method TEXT`);
    await db.query(`ALTER TABLE influencers ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'bronze'`);
    await db.query(`ALTER TABLE influencer_commissions ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,4)`);
    await db.query(`ALTER TABLE influencer_commissions ADD COLUMN IF NOT EXISTS months_applied INT DEFAULT 1`);
    await db.query(`ALTER TABLE influencer_commissions ADD COLUMN IF NOT EXISTS activation_bonus NUMERIC(8,2) DEFAULT 0`);
    await db.query(`ALTER TABLE influencer_commissions ADD COLUMN IF NOT EXISTS eligible_at TIMESTAMPTZ`);
    await db.query(`ALTER TABLE influencer_commissions ADD COLUMN IF NOT EXISTS blocked_reason TEXT`);
    await db.query(`ALTER TABLE influencers ADD COLUMN IF NOT EXISTS country_code TEXT`);
    await db.query(`ALTER TABLE influencer_commissions ADD COLUMN IF NOT EXISTS commission_type TEXT DEFAULT 'sale'`);
    await db.query(`ALTER TABLE influencers ADD COLUMN IF NOT EXISTS welcome_bonus_granted_at TIMESTAMPTZ`);
    // Replace the unconditional user_id unique index with a sale-only partial index so welcome_bonus
    // rows can share the same user_id as their triggering sale commission.
    await db.query(`DROP INDEX IF EXISTS idx_inf_commissions_user`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_inf_commissions_user_sale ON influencer_commissions(user_id) WHERE commission_type = 'sale'`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_inf_welcome_bonus ON influencer_commissions(influencer_id) WHERE commission_type = 'welcome_bonus'`);
    await db.query(`ALTER TABLE influencers ADD COLUMN IF NOT EXISTS stripe_connect_id TEXT`);
    await db.query(`ALTER TABLE influencers ADD COLUMN IF NOT EXISTS stripe_onboard_status TEXT DEFAULT 'not_started'`);
    await db.query(`ALTER TABLE influencers ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN DEFAULT FALSE`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_inf_commissions_eligible ON influencer_commissions(eligible_at) WHERE status = 'pending'`);
    promoteEligibleCommissions();
    // ── Monthly affiliate summary email tracker ────────────────────────────────
    await db.query(`CREATE TABLE IF NOT EXISTS influencer_monthly_email_log (
      influencer_id INT NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
      month_key TEXT NOT NULL,
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (influencer_id, month_key)
    )`);
    // ── Books / Manuscript storage ────────────────────────────────────────────
    await db.query(`CREATE TABLE IF NOT EXISTS book_chapters (
      id SERIAL PRIMARY KEY,
      book_title TEXT NOT NULL,
      chapter_number INT NOT NULL DEFAULT 1,
      chapter_title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      is_published BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_book_chapters_book ON book_chapters(book_title, chapter_number)`);
    // ── Workbook purchases ────────────────────────────────────────────────────────
    await db.query(`CREATE TABLE IF NOT EXISTS workbook_purchases (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      book_id TEXT NOT NULL DEFAULT 'book1',
      stripe_session_id TEXT UNIQUE NOT NULL,
      stripe_payment_intent_id TEXT,
      download_token TEXT UNIQUE NOT NULL,
      token_expires_at TIMESTAMPTZ NOT NULL,
      download_count INTEGER DEFAULT 0,
      max_downloads INTEGER DEFAULT 5,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_workbook_purchases_token ON workbook_purchases(download_token)`);
    // ── Email subscriber source tagging ───────────────────────────────────────
    await db.query(`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'newsletter'`);
    // ── Book launch email tracking ────────────────────────────────────────────
    await db.query(`ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS book_launch_sent_at TIMESTAMPTZ`);
    // ── Team Challenges ───────────────────────────────────────────────────────────
    await db.query(`CREATE TABLE IF NOT EXISTS team_challenges (
      id SERIAL PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      challenge_type TEXT NOT NULL DEFAULT 'quiz',
      target_module_id INTEGER,
      target_score INTEGER DEFAULT 80,
      starts_at TIMESTAMPTZ DEFAULT NOW(),
      ends_at TIMESTAMPTZ NOT NULL,
      badge_emoji TEXT DEFAULT '🏆',
      is_active BOOLEAN DEFAULT TRUE,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS team_challenge_entries (
      id SERIAL PRIMARY KEY,
      challenge_id INTEGER NOT NULL REFERENCES team_challenges(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      score INTEGER DEFAULT 0,
      completed_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(challenge_id, user_id)
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_team_challenges_restaurant ON team_challenges(restaurant_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_challenge_entries_challenge ON team_challenge_entries(challenge_id)`);
    // ── Custom AI Guest Personas ──────────────────────────────────────────────────
    await db.query(`CREATE TABLE IF NOT EXISTS custom_personas (
      id SERIAL PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'Guest',
      difficulty TEXT DEFAULT 'medium',
      scenario_prompt TEXT NOT NULL,
      emoji TEXT DEFAULT '🎭',
      is_active BOOLEAN DEFAULT TRUE,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_custom_personas_restaurant ON custom_personas(restaurant_id)`);
    // ── Custom Module Builder ─────────────────────────────────────────────────────
    await db.query(`CREATE TABLE IF NOT EXISTS custom_modules (
      id SERIAL PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      emoji TEXT DEFAULT '📚',
      description TEXT DEFAULT '',
      mins INTEGER DEFAULT 10,
      is_published BOOLEAN DEFAULT FALSE,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS custom_module_sections (
      id SERIAL PRIMARY KEY,
      module_id INTEGER NOT NULL REFERENCES custom_modules(id) ON DELETE CASCADE,
      sort_order INTEGER DEFAULT 0,
      heading TEXT NOT NULL,
      body TEXT NOT NULL
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS custom_module_questions (
      id SERIAL PRIMARY KEY,
      module_id INTEGER NOT NULL REFERENCES custom_modules(id) ON DELETE CASCADE,
      sort_order INTEGER DEFAULT 0,
      question TEXT NOT NULL,
      options JSONB NOT NULL DEFAULT '[]',
      correct_index INTEGER NOT NULL DEFAULT 0,
      explanation TEXT
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_custom_modules_restaurant ON custom_modules(restaurant_id)`);
    // ── Scenario branching pilot (#39): persist chosen branch path ──────────────
    await db.query(`ALTER TABLE scenario_scores ADD COLUMN IF NOT EXISTS branch_choice_id TEXT`);
    await db.query(`ALTER TABLE scenario_scores ADD COLUMN IF NOT EXISTS branch_recommended BOOLEAN`);
    await db.query(`ALTER TABLE book_chapters ADD COLUMN IF NOT EXISTS source_file TEXT`);
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_digest_enabled BOOLEAN DEFAULT TRUE`);
    console.log('Schema additions complete');
  } catch (e) { console.error('Schema additions error:', e.message); }
})();
// ── Roleplays API ────────────────────────────────────────────────────────────────
// 404 catch-all — must come after all routes, before the error handler
app.use((req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
});

// Global error handler — must be mounted after all routes
app.use(errorHandler);

const server = app.listen(process.env.PORT || 5000, () => {
  logger.info('server_start', { port: Number(process.env.PORT || 5000), env: process.env.NODE_ENV || 'development' });
});
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
