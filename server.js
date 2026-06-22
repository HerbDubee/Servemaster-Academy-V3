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
// Prevent crawlers from indexing API routes — stops OAuth redirect chains
// and API endpoints from being flagged as exposed secrets by scanners
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.use(compression());
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
    const affRef = req.cookies && req.cookies.sma_ref;
    if (affRef) {
      try { await db.query(`UPDATE users SET influencer_ref_code = $1 WHERE id = $2 AND influencer_ref_code IS NULL`, [affRef, user.id]); } catch (e) {}
    }
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('token', token, COOKIE_OPTS);
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, token, message: 'Account created – 14-day trial started!' });
    (async () => { try {
      const wb = await getTenantBrandingForEmail(user.id);
      const unsubToken = await getOrCreateUnsubToken(user.id);
      const unsubUrl = `${APP_URL}/unsubscribe?token=${unsubToken}`;
      resend.emails.send({
        from: wb.fromLine,
        to: user.email,
        subject: `Welcome to ${wb.brandName} – Your 14-day trial starts now`,
        html: `
          <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
            <img src="${wb.logoUrl}" alt="${escapeHtml(wb.brandName)}" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;">
            <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(user.name)},</p>
            <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">I'm Kirk Adamson, founder of ServeMaster Academy.</p>
            <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Thank you for starting your free trial. I created this platform because I believe every guest deserves to feel truly cared for — and every server deserves the tools to make that happen.</p>
            <p style="font-size:16px;line-height:1.7;margin-bottom:32px;">Your 14-day journey begins now. I recommend starting with Module 1: Foundations of Exceptional Service.</p>
            <p style="margin-bottom:32px;">
              <a href="${APP_URL}/app" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Start Module 1 Now</a>
            </p>
            <p style="font-size:16px;line-height:1.7;margin-bottom:24px;">I'd love to hear what you think after your first session.</p>
            <p style="font-size:15px;line-height:1.7;color:#a3a3a3;">Warm regards,<br>
            <strong style="color:#f5f5f5;">Kirk Adamson</strong><br>
            Founder, ServeMaster Academy<br>
            <a href="mailto:${FROM_EMAIL}" style="color:#d4af37;text-decoration:none;">${FROM_EMAIL}</a></p>
            ${wb.poweredBy}
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
      const resetLink = `${APP_URL}/reset-password?token=${token}`;
      await resend.emails.send({
        from: `Kirk Adamson <${FROM_EMAIL}>`,
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
  // Explicitly block crawlers from following this redirect chain
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
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
        const affRefG = req.cookies && req.cookies.sma_ref;
        if (affRefG) {
          try { await db.query(`UPDATE users SET influencer_ref_code = $1 WHERE id = $2 AND influencer_ref_code IS NULL`, [affRefG, user.id]); } catch (e) {}
        }
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
        const wb = await getTenantBrandingForEmail(user.id);
        const unsubToken = await getOrCreateUnsubToken(user.id);
        const unsubUrl = `https://servemasteracademy.ca/unsubscribe?token=${unsubToken}`;
        resend.emails.send({
          from: wb.fromLine,
          to: user.email,
          subject: `Welcome to ${wb.brandName} – Your 14-day trial starts now`,
          html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="${wb.logoUrl}" alt="${escapeHtml(wb.brandName)}" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(user.name)},</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">I'm Kirk Adamson, founder of ServeMaster Academy.</p><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Thank you for starting your free trial. I created this platform because I believe every guest deserves to feel truly cared for — and every server deserves the tools to make that happen.</p><p style="font-size:16px;line-height:1.7;margin-bottom:32px;">Your 14-day journey begins now. I recommend starting with Module 1: Foundations of Exceptional Service.</p><p style="margin-bottom:32px;"><a href="https://servemasteracademy.ca/app" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Start Module 1 Now</a></p><p style="font-size:16px;line-height:1.7;margin-bottom:24px;">I'd love to hear what you think after your first session.</p><p style="font-size:15px;line-height:1.7;color:#a3a3a3;">Warm regards,<br><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy<br><a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#d4af37;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a></p>${wb.poweredBy}${emailFooter(unsubUrl)}</div>`
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

// ── Weekly manager digest ────────────────────────────────────────────────────
async function sendWeeklyManagerDigests() {
  try {
    const now = new Date();
    // Digest covers the previous Mon–Sun ET week (lastMonday 00:00 → thisMonday 00:00).
    // WoW comparison covers the week before that (prev2Monday → lastMonday).
    const thisMonday  = _mostRecentMondayMidnightET(now);
    const lastMonday  = new Date(thisMonday.getTime()  - 7 * 24 * 60 * 60 * 1000);
    const prev2Monday = new Date(lastMonday.getTime()  - 7 * 24 * 60 * 60 * 1000);
    const weekLabel = `${lastMonday.toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'America/Toronto'})} – ${new Date(thisMonday.getTime()-1000).toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'America/Toronto'})}`;

    // Only paid, opted-in, not unsubscribed managers with a restaurant
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
      // Team member list (lifetime totals for the table)
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

      // Modules completed in window (prev Mon–Sun), scenarios, quiz — all with WoW deltas
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

      // White-label: prefer wl config when active, else cert_logo_url, else SMA defaults
      const wlActive = !!mgr.wl_is_active;
      const logoUrl = (wlActive && mgr.wl_logo_url) || mgr.cert_logo_url || 'https://servemasteracademy.ca/logo.png';
      const brandName = escapeHtml((wlActive && mgr.wl_brand_name) || mgr.restaurant_name);
      const brandColor = (wlActive && mgr.wl_primary_color) || '#d4af37';

      // Newly certified in window (with prior-week count for WoW delta)
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
  const { email, firstName, source, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
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
// Shared TTS handler — streams OpenAI audio directly to the client
// without buffering, so the browser can start playing on first bytes received.
async function handleTTS(text, lang, res) {
  if (!text || typeof text !== 'string') return res.status(400).json({ error: 'Missing text' });
  const SUPPORTED_TTS_LANGS = new Set(['en', 'fr', 'es']);
  const reqLang = (lang && SUPPORTED_TTS_LANGS.has(lang)) ? lang : 'en';
  const trimmed = text.trim();
  if (!trimmed) return res.status(400).json({ error: 'Empty text' });
  if (trimmed.length > 4000) return res.status(400).json({ error: 'Text exceeds 4000 character limit' });
  try {
    const TTS_VOICE_MAP = { en: 'nova', fr: 'nova', es: 'nova' };
    const voice = TTS_VOICE_MAP[reqLang] || 'nova';
    const response = await getTTS().audio.speech.create({
      model: 'tts-1',
      voice,
      input: trimmed,
      response_format: 'mp3'
    });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=300');
    // Pipe OpenAI's stream directly — client starts playing on first chunk
    const reader = response.body.getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done || res.writableEnded) break;
          res.write(Buffer.from(value));
        }
        if (!res.writableEnded) res.end();
      } catch { if (!res.writableEnded) res.end(); }
    };
    pump();
  } catch (err) {
    console.error('TTS error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'TTS failed' });
  }
}

// GET — used by the client via <Audio src> for zero-buffer streaming playback
app.get('/api/tts', authMiddleware, aiLimiter, (req, res) => handleTTS(req.query.text, req.query.lang, res));

// POST — kept for backward compatibility
app.post('/api/tts', authMiddleware, aiLimiter, (req, res) => handleTTS(req.body.text, req.body.lang, res));

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
  1: { title: 'The Difficult Guest', systemPrompt: `PERSONALITY: He's the kind of man who believes years of loyalty entitle him to special treatment. His anger is quiet and controlled — clipped sentences, disappointed sighs, the occasional pointed pause. He doesn't shout; he expects. That makes him harder to handle than someone who yells.\n\nSCENARIO: A guest has arrived 20 minutes late for his reservation and the table has been given away. He insists it should still be held. The user is playing the server who must handle this calmly and find a solution. Keep the scenario focused — only this problem. React realistically: if the server is empathetic and solution-focused, he gradually softens. If they are dismissive or make excuses, he escalates with quiet authority.` },
  2: { title: 'Wine Upselling', systemPrompt: `PERSONALITY: A warm, easy-going couple in their mid-thirties. They're celebrating something — maybe an anniversary, maybe just a good week. They feel a little out of their depth on the wine list and are slightly embarrassed about it, but they're genuinely curious and will follow a confident, friendly recommendation. They do not respond well to being lectured or overwhelmed with options.\n\nSCENARIO: They have a moderate budget and are unsure what wine to order. The user is playing the server who should guide them to a good choice. React positively to genuine, specific recommendations and warmly to servers who ask smart questions (red or white? heavy or light? what are you eating?). React with polite disengagement to servers who just rattle off wine names without connecting to their needs or tastes.` },
  3: { title: 'Serious Food Allergy', systemPrompt: `PERSONALITY: Polite, well-prepared, a little apologetic about being "difficult" — but firm. She's had a bad reaction at a restaurant before and carries an EpiPen. She has learned to ask very specific questions and to trust her gut when a server seems uncertain. She is not hostile, but she has a quiet radar for servers who are guessing.\n\nSCENARIO: She has a severe nut allergy. The user is playing the server who must handle this safely and reassuringly. She asks detailed questions about dishes, preparation methods, and cross-contamination. If the server seems dismissive, guesses, or uses the phrase "I think it's fine" without checking, her polite manner becomes visibly tighter and she stops trusting them.` },
  4: { title: 'The Long Wait Complaint', systemPrompt: `PERSONALITY: Not a complainer by nature — he hates making a fuss. But 45 minutes is 45 minutes, and his dining companion is clearly hungry and unhappy. He's not going to yell; he's going to state the facts in a flat, quiet voice and watch what happens. He's checked his watch twice in the last minute. He will accept a genuine, specific response. He will not accept platitudes.\n\nSCENARIO: He has been waiting 45 minutes for the main course. The user is playing the server who must acknowledge the wait, apologize sincerely, and take concrete action. React authentically: a specific apology with a concrete update ("15 more minutes and I'll check right now") will soften him. A hollow "so sorry about that!" with no information will not.` },
  5: { title: 'Dessert Upselling', systemPrompt: `PERSONALITY: She is genuinely stuffed and says so with a laugh. She has no intention of ordering dessert. She's warm and easy to talk to — she won't be rude about a dessert recommendation — but she means what she says. She can be won over if the server makes her want something, not just offers it to her.\n\nSCENARIO: She has just finished a large main course and says she is "absolutely stuffed." The user is playing the server who must try to sell a dessert. React naturally: if the server lists desserts flatly, she will decline warmly but firmly. If the server describes one with genuine sensory enthusiasm — "it's more like a warm chocolate cloud than a full dessert" — she might pause. She decides in the moment, not from a menu recitation.` },
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
  const { scenarioId, messages, lang, sceneContext } = req.body;
  const scenario = scenarios[scenarioId];
  if (!scenario && !sceneContext) return res.status(400).json({ error: 'Invalid scenario' });
  const thirdPersonWrapper = lang === 'fr'
    ? `STYLE DE NARRATION — IMPORTANT : Narrez toujours le client à la troisième personne. Ne parlez jamais en tant que client à la première personne. Décrivez ce que dit et fait le client comme un narrateur : "Le client fronce les sourcils et dit : '...'". Utilisez "le client", "il", "elle" ou "ils" tout au long.\n\nBRIÈVETÉ — Soyez concis. Chaque réponse : une action brève + une réplique de dialogue. Pas de description d'ambiance, de décor ou de narration atmosphérique. Allez droit au comportement et aux mots du client.\n\n`
    : lang === 'es'
    ? `ESTILO DE NARRACIÓN — IMPORTANTE: Narra siempre al cliente en tercera persona. Nunca hables como el cliente en primera persona. Describe lo que dice y hace el cliente como narrador: "El cliente frunce el ceño y dice: '...'". Usa "el cliente", "él", "ella" o "ellos" en todo momento.\n\nBREVEDAD — Sé conciso. Cada respuesta: una acción breve + una línea de diálogo. Sin descripciones de ambiente, escenario ni narración atmosférica. Ve directo al comportamiento y las palabras del cliente.\n\n`
    : `NARRATION STYLE — IMPORTANT: Always narrate the customer in third person. Never speak as the customer in first person ("I want...", "I'm angry..."). Instead, describe what the customer says and does as a narrator: "The customer frowns and says: '...'", "He crosses his arms and replies: '...'". Use "the customer", "he", "she", or "they" throughout.\n\nBREVITY — Be concise. Each response: one short action beat + one line of dialogue. No scene-setting, no atmospheric description, no describing the restaurant or surroundings. Go straight to the guest's behavior and words.\n\nPERSONALITY AUTHENTICITY — Every guest has a real personality. Use varied, casual, natural language that fits who they are. Impatient guests speak in clipped, blunt sentences. Confused tourists over-explain and apologize. Entitled guests have a quiet expectation of superiority — they don't shout, they sigh. Friendly regulars use humour and first names. Sarcastic guests are deadpan, not hostile. Let the personality come through in word choice, not just stated emotion.\n\nEMOTIONAL RANGE — Guests are real people with real moods. Show irritation, dry humour, relief, embarrassment, warmth, suspicion, impatience, genuine delight — whatever fits the moment. Flat, polite responses are unrealistic and unhelpful for training.\n\nRECOVERY MECHANICS — If the server makes a genuine recovery — specific apology, fast action, honest communication — let the guest visibly soften or de-escalate. Real guests want good service; they will reward it when they get it. Permanent hostility is not realistic. Show the arc.\n\n`;
  const langInstruction = lang === 'fr'
    ? 'IMPORTANT : Cette conversation se déroule en français. Tu DOIS répondre entièrement en français.\n\n'
    : lang === 'es'
    ? 'IMPORTANTE: Esta conversación ocurre en español. DEBES responder completamente en español.\n\n'
    : '';
  const basePrompt = scenario
    ? scenario.systemPrompt
    : `You are playing the role of a guest in a hospitality training scenario. The user is playing the server. Stay completely in character as the guest described in this scene. React realistically to how the server handles the situation — positively to skill and professionalism, negatively to mistakes or poor technique. Keep responses concise.\n\nScene: ${sceneContext}`;
  const systemContent = langInstruction + thirdPersonWrapper + basePrompt;
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
  const { scenarioId, messages, lang, sceneTitle, sceneContext } = req.body;
  const scenario = scenarios[scenarioId];
  if (!scenario && !sceneContext) return res.status(400).json({ error: 'Invalid scenario' });
  const scenarioTitle = scenario ? scenario.title : (sceneTitle || 'Hospitality Scenario');
  const langInstruction = lang === 'fr'
    ? 'IMPORTANT : Rédige toute ta réponse en français. Tous les champs JSON doivent être en français.\n\n'
    : lang === 'es'
    ? 'IMPORTANTE: Escribe toda tu respuesta en español. Todos los campos JSON deben estar en español.\n\n'
    : '';
  const systemPrompt = langInstruction + `You are a strict, experienced fine-dining hospitality trainer reviewing a server's performance in a roleplay exercise.

Scenario: "${scenarioTitle}"

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


// Cron: check hourly; fire on Monday 8am ET if not yet sent today.
async function maybeRunOpenClawDigestCron() {
  try {
    const now = new Date();
    const torontoFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Toronto', weekday: 'short', hour: 'numeric', hour12: false
    }).formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    const isMonday = torontoFmt.weekday === 'Mon';
    const hour = parseInt(torontoFmt.hour);
    if (!isMonday || hour < 8 || hour >= 9) return;
    const last = await db.query(`SELECT value FROM site_settings WHERE key='openclaw_digest_last_sent_at'`);
    const lastIso = last.rows[0]?.value;
    if (lastIso) {
      const lastDate = new Date(lastIso);
      const sinceMs = now.getTime() - lastDate.getTime();
      if (sinceMs < 6 * 24 * 60 * 60 * 1000) return; // already sent in last 6 days
    }
    await sendOpenClawWeeklyDigest();
  } catch (e) { console.error('[OpenClaw digest] cron error:', e.message); }
}
setInterval(maybeRunOpenClawDigestCron, 60 * 60 * 1000); // hourly
setTimeout(maybeRunOpenClawDigestCron, 30 * 1000); // initial check shortly after boot

// ── Manager weekly digest — Monday 8 am ET, idempotent ───────────────────────
async function maybeRunManagerDigestCron() {
  try {
    const torontoFmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      weekday: 'short', hour: 'numeric', hour12: false
    }).formatToParts(new Date()).reduce((a, p) => ({ ...a, [p.type]: p.value }), {});
    if (torontoFmt.weekday !== 'Mon') return;
    const hour = parseInt(torontoFmt.hour, 10);
    if (hour < 8 || hour >= 9) return;

    // Idempotency: only send once per Mon window
    const key = 'manager_digest_last_sent_at';
    const settingRes = await db.query(`SELECT value FROM site_settings WHERE key = $1`, [key]);
    if (settingRes.rows.length) {
      const lastSent = new Date(settingRes.rows[0].value);
      const sinceMs = Date.now() - lastSent.getTime();
      if (sinceMs < 6 * 24 * 60 * 60 * 1000) return; // already sent in last 6 days
    }

    const { sent, skipped } = await sendWeeklyManagerDigests();
    const now = new Date().toISOString();
    await db.query(
      `INSERT INTO site_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      [key, now]
    );
    console.log(`[Manager digest] sent=${sent} skipped=${skipped} at ${now}`);
  } catch (e) { console.error('[Manager digest] cron error:', e.message); }
}
setInterval(maybeRunManagerDigestCron, 60 * 60 * 1000); // hourly
setTimeout(maybeRunManagerDigestCron, 45 * 1000); // initial check shortly after boot

async function maybeRunKirkTrialDigestCron() {
  try {
    const torontoFmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto', hour: 'numeric', hour12: false
    }).formatToParts(new Date()).reduce((a, p) => ({ ...a, [p.type]: p.value }), {});
    const hour = parseInt(torontoFmt.hour, 10);

    // Read the configured digest hour (default 8 ET); clamp to valid range [0,23]
    const hourSettingRes = await db.query(`SELECT value FROM site_settings WHERE key = 'kirk_trial_digest_hour_et'`);
    const parsedHour = hourSettingRes.rows.length ? parseInt(hourSettingRes.rows[0].value, 10) : NaN;
    const targetHour = (!isNaN(parsedHour) && parsedHour >= 0 && parsedHour <= 23) ? parsedHour : 8;

    if (hour < targetHour || hour >= targetHour + 1) return;

    const key = 'kirk_trial_digest_last_sent_at';
    const settingRes = await db.query(`SELECT value FROM site_settings WHERE key = $1`, [key]);
    if (settingRes.rows.length) {
      const lastSent = new Date(settingRes.rows[0].value);
      if (Date.now() - lastSent.getTime() < 20 * 60 * 60 * 1000) return; // already sent in last 20 h
    }

    const { sent } = await sendKirkTrialDigest();
    await db.query(
      `INSERT INTO site_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
      [key, new Date().toISOString()]
    );
    if (sent > 0) console.log(`[Kirk trial digest] cron fired, ${sent} request(s) included`);
  } catch (e) { console.error('[Kirk trial digest] cron error:', e.message); }
}
setInterval(maybeRunKirkTrialDigestCron, 60 * 60 * 1000); // hourly
setTimeout(maybeRunKirkTrialDigestCron, 60 * 1000); // initial check shortly after boot

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
app.get('/api/roleplays', async (req, res) => {
  try {
    const { category } = req.query;
    const result = await db.query(
      'SELECT * FROM roleplays WHERE category = $1 ORDER BY id ASC',
      [category || 'difficult-guests']
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load roleplays' });
  }
});

app.get('/api/quizzes', async (req, res) => {
  try {
    const { module } = req.query;
    const result = await db.query(
      'SELECT * FROM quizzes WHERE module_name = $1',
      [module || 'wine-service']
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load quiz' });
  }
});

// ── Curriculum Check Route ───────────────────────────────────────────────────────
app.get('/check-curriculum', async (req, res) => {
  try {
    const roleplays = await db.query('SELECT * FROM roleplays WHERE category = $1', ['difficult-guests']);
    const quizzes = await db.query('SELECT * FROM quizzes WHERE module_name = $1', ['wine-service']);
    res.json({ roleplays: roleplays.rows, quizzes: quizzes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Expanded Curriculum Setup Route ─────────────────────────────────────────────
app.get('/setup-curriculum-expanded', adminMiddleware, async (req, res) => {
  try {
    const roleplays = [
      {
        category: 'difficult-guests',
        title: 'The guest who says the wine is wrong',
        setup: 'A couple is celebrating their anniversary. The guest orders a Pinot Noir, takes one sip, and immediately declares it "bad" and "not what they asked for."',
        dialogue: "Guest: This isn't right. I asked for a Pinot Noir and this tastes completely off.\nServer: I'm sorry it's not meeting your expectations. May I ask what seems off about it to you?\nGuest: It tastes sharp… almost sour. I don't like it at all.\nServer: Thank you for letting me know. I did serve the Pinot Noir you selected, but I understand it may not be the style you were hoping for. Would you like me to suggest a couple of softer, more fruit-forward options?",
        debrief: "Primary objective: Never argue with the guest's perception of taste — taste is subjective, and the guest's experience is always valid.\n\nWhy this matters in fine dining: Guests expect the server to be a knowledgeable guide, not a defender of the wine list. When a guest says a wine is wrong, they are communicating discomfort. Your job is to resolve that discomfort quickly and gracefully — especially on a celebratory occasion where the emotional stakes are high.\n\nCommon mistakes to avoid:\n• Saying \"This is the wine you ordered\" — factually true but dismissive\n• Arguing about the wine's quality or style\n• Leaving the guest with a glass they dislike\n• Failing to offer an alternative quickly\n\nPro tip: Always offer to remove the glass immediately, even before proposing an alternative. This signals empathy and decisiveness. Then ask one clarifying question — \"too sharp,\" \"too dry,\" \"too heavy?\" — to guide your recommendation. Keep the guest's focus on the celebration, not the complaint.",
        voice_style_server: 'calm, polished, reassuring',
        voice_style_guest: 'disappointed but not aggressive'
      },
      {
        category: 'difficult-guests',
        title: 'The guest who feels ignored and turns hostile',
        setup: 'A four-top has waited 12 minutes for service during a busy shift. One guest is visibly frustrated when the server finally approaches.',
        dialogue: "Guest: Finally! Does anyone actually work this section?\nServer: I'm truly sorry for the wait — you're right to expect a faster welcome. I'm here now and ready to take excellent care of you.\nGuest: We've been sitting here forever. This is not a great start.\nServer: I completely understand. Let me get your drink order in right away and help turn this around.",
        debrief: "Primary objective: Acknowledge the delay immediately and without defensiveness — then move swiftly to action.\n\nWhy this matters: Guests in upscale restaurants pay for a seamless experience from the moment they sit down. A 12-minute wait with no acknowledgment feels like indifference. When a guest finally vents that frustration, the instinct is to defend yourself or explain the situation — resist this entirely. Your explanation is irrelevant to the guest's experience in that moment.\n\nCommon mistakes to avoid:\n• Blaming the host, the kitchen, or a coworker — it reflects poorly on the whole team\n• Over-explaining why the wait happened\n• Matching the guest's energy or becoming defensive\n• Offering a hollow \"sorry for the wait\" without immediate action\n\nPro tip: Use the phrase \"I'm here now and ready to take excellent care of you\" — it resets the interaction by shifting focus from the past (the wait) to the present (attentive service). Follow it immediately with action: take the drink order, bring water, or offer something tangible. Recovery speed is everything.",
        voice_style_server: 'steady, apologetic but confident',
        voice_style_guest: 'irritated and sarcastic'
      },
      {
        category: 'difficult-guests',
        title: 'The guest who wants rules broken for a special occasion',
        setup: 'A birthday table wants to open a bottle they brought in, but corkage is not allowed that evening.',
        dialogue: "Guest: It's my sister's birthday. We brought a special bottle — can you open it for us?\nServer: Happy birthday to your sister! Thank you for celebrating with us. Unfortunately, we're not able to open outside bottles this evening due to policy.\nGuest: That's ridiculous. Can't you make one exception?\nServer: I understand this is disappointing, especially on a special night. While I can't override the policy, I'd love to help make the celebration memorable — may I suggest a bottle from our list that might feel equally special?",
        debrief: "Primary objective: Validate the special occasion first, then state the policy clearly — and always redirect toward a positive alternative.\n\nWhy this matters: Special occasions are emotionally charged. When a guest has planned to bring a meaningful bottle for a birthday or anniversary, being told no feels like a personal rejection. The way you deliver the policy determines whether they leave frustrated or impressed.\n\nCommon mistakes to avoid:\n• A cold \"Sorry, it's our policy\" with no warmth or alternative\n• Pretending you'll \"check\" and returning with the same answer — this wastes time and erodes trust\n• Apologizing so much that you seem uncertain about the policy\n• Failing to offer a compelling alternative from the wine list\n\nPro tip: Acknowledge the occasion before the policy — always. \"Happy birthday to your sister\" before \"unfortunately\" changes the entire tone of the conversation. Then offer a specific alternative, not a vague gesture. \"We have a lovely Champagne we reserve for special celebrations\" is far more effective than \"we have some nice wines.\" Make the alternative feel like an upgrade, not a consolation.",
        voice_style_server: 'gracious, composed, warm',
        voice_style_guest: 'emotionally invested and insistent'
      }
    ];

    for (const rp of roleplays) {
      await db.query(
        `INSERT INTO roleplays (category, title, setup, dialogue, debrief, voice_style_server, voice_style_guest)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (title) DO UPDATE SET
           setup = EXCLUDED.setup,
           dialogue = EXCLUDED.dialogue,
           debrief = EXCLUDED.debrief,
           voice_style_server = EXCLUDED.voice_style_server,
           voice_style_guest = EXCLUDED.voice_style_guest`,
        [rp.category, rp.title, rp.setup, rp.dialogue, rp.debrief, rp.voice_style_server, rp.voice_style_guest]
      );
    }

    res.send(`<!DOCTYPE html><html><head><style>body{font-family:sans-serif;max-width:600px;margin:60px auto;padding:0 20px;background:#09090b;color:#fafafa;}h1{color:#4ade80;}</style></head><body>
      <h1>✅ Expanded Curriculum Updated!</h1>
      <p>The 3 difficult-guest role-plays now have full expanded debriefs including objectives, why it matters, common mistakes, and pro tips.</p>
      <p><a href="/api/roleplays?category=difficult-guests" style="color:#FF5E3A;">View updated role-plays →</a></p>
      <p><a href="/training" style="color:#FF5E3A;">View Training Hub →</a></p>
      <p><a href="/admin" style="color:#a1a1aa;">← Back to Admin</a></p>
    </body></html>`);
  } catch (e) {
    console.error('Expanded curriculum error:', e.message);
    res.status(500).send('Error: ' + e.message);
  }
});

// ── Curriculum Setup Route ───────────────────────────────────────────────────────
app.get('/setup-curriculum', adminMiddleware, async (req, res) => {
  try {
    console.log('Starting curriculum insertion...');

    // 1. Insert 3 Difficult Guest Role-Plays
    await db.query(`
      INSERT INTO roleplays (category, title, setup, dialogue, debrief, voice_style_server, voice_style_guest)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7),
        ($8,$9,$10,$11,$12,$13,$14),
        ($15,$16,$17,$18,$19,$20,$21)
      ON CONFLICT (title) DO NOTHING
    `, [
      'difficult-guests',
      'The guest who says the wine is wrong',
      'A couple is celebrating their anniversary. The guest orders a Pinot Noir, takes one sip, and immediately declares it "bad" and "not what they asked for."',
      'Guest: This isn\'t right. I asked for a Pinot Noir and this tastes completely off.\nServer: I\'m sorry it\'s not meeting your expectations. May I ask what seems off about it to you?\nGuest: It tastes sharp… almost sour. I don\'t like it at all.\nServer: Thank you for letting me know. I did serve the Pinot Noir you selected, but I understand it may not be the style you were hoping for. Would you like me to suggest a couple of softer, more fruit-forward options?',
      'Never argue with the guest\'s perception. Gather information calmly, offer solutions, and protect the celebratory mood.',
      'calm, polished, reassuring',
      'disappointed but not aggressive',

      'difficult-guests',
      'The guest who feels ignored and turns hostile',
      'A four-top has waited 12 minutes for service during a busy shift. One guest is visibly frustrated when the server finally approaches.',
      'Guest: Finally! Does anyone actually work this section?\nServer: I\'m truly sorry for the wait — you\'re right to expect a faster welcome. I\'m here now and ready to take excellent care of you.\nGuest: We\'ve been sitting here forever. This is not a great start.\nServer: I completely understand. Let me get your drink order in right away and help turn this around.',
      'Acknowledge the poor experience immediately. Stay solution-focused and never blame other staff.',
      'steady, apologetic but confident',
      'irritated and sarcastic',

      'difficult-guests',
      'The guest who wants rules broken for a special occasion',
      'A birthday table wants to open a bottle they brought in, but corkage is not allowed that evening.',
      'Guest: It\'s my sister\'s birthday. We brought a special bottle — can you open it for us?\nServer: Happy birthday to your sister! Thank you for celebrating with us. Unfortunately, we\'re not able to open outside bottles this evening due to policy.\nGuest: That\'s ridiculous. Can\'t you make one exception?\nServer: I understand this is disappointing, especially on a special night. While I can\'t override the policy, I\'d love to help make the celebration memorable.',
      'Show genuine empathy. State the policy clearly and kindly. Always offer alternatives.',
      'gracious, composed, warm',
      'emotionally invested and insistent'
    ]);

    // 2. Insert Wine Service Quiz (10 questions)
    const wineQuestions = [
      {
        id: 1,
        type: 'multiple-choice',
        question: 'When presenting a bottle of wine to the host, what is the main purpose?',
        options: [
          'To confirm the bottle\'s price',
          'To confirm the producer, varietal, and vintage before opening',
          'To let the host smell the cork first',
          'To begin pouring immediately'
        ],
        correct: 1,
        explanation: 'The presentation confirms the correct bottle before opening and helps avoid service mistakes.'
      },
      {
        id: 2,
        type: 'multiple-choice',
        question: 'What does it mean when a guest says a wine is "corked"?',
        options: [
          'The cork broke during opening',
          'The wine is too young and needs more time',
          'The wine has a musty, wet cardboard smell from TCA contamination',
          'The wine was over-chilled'
        ],
        correct: 2,
        explanation: 'A "corked" wine is contaminated with TCA (trichloroanisole), which produces a musty or wet cardboard smell. It is a wine fault, not a preference issue.'
      },
      {
        id: 3,
        type: 'multiple-choice',
        question: 'After the host approves the wine, who should be served first?',
        options: [
          'The host, since they ordered and approved it',
          'The eldest guest at the table',
          'Guests clockwise from the host\'s right, with the host poured last',
          'Whoever asks first'
        ],
        correct: 2,
        explanation: 'Proper wine service protocol is to pour guests first — typically ladies before gentlemen, then the host last to ensure quality control throughout.'
      },
      {
        id: 4,
        type: 'multiple-choice',
        question: 'When should a red wine typically be decanted?',
        options: [
          'Every red wine should be decanted regardless of age',
          'Only wines over 30 years old',
          'Young tannic wines that benefit from aeration, or older wines with sediment',
          'Only when requested by the sommelier'
        ],
        correct: 2,
        explanation: 'Decanting serves two purposes: aerating young, tannic reds to soften them, and separating sediment from older wines.'
      },
      {
        id: 5,
        type: 'multiple-choice',
        question: 'At what temperature should most white wines be served?',
        options: [
          'Ice cold — straight from the freezer (28–32°F / -2–0°C)',
          'Cellar temperature (55–65°F / 13–18°C)',
          'Chilled (45–55°F / 7–13°C)',
          'Room temperature (68–72°F / 20–22°C)'
        ],
        correct: 2,
        explanation: 'White wines are best served chilled at 45–55°F (7–13°C) to preserve their freshness and aromatics without masking them.'
      },
      {
        id: 6,
        type: 'multiple-choice',
        question: 'What is the correct fill level for a standard 5 oz red wine pour?',
        options: [
          'Fill to the brim to show generosity',
          'Fill to three-quarters of the glass',
          'Fill to approximately one-third of the glass',
          'Fill to the halfway point'
        ],
        correct: 2,
        explanation: 'Pouring to one-third allows room for the wine to breathe and for the guest to swirl, releasing aromas without risking spills.'
      },
      {
        id: 7,
        type: 'multiple-choice',
        question: 'A guest tastes the wine and says it tastes "flat" and "boring" — but the wine has no faults. You should:',
        options: [
          'Agree with them and replace the bottle immediately',
          'Argue that the wine is correct and they are wrong',
          'Calmly describe the wine\'s characteristics and offer an alternative style',
          'Get the manager right away without attempting resolution'
        ],
        correct: 2,
        explanation: '"Flat" is a preference, not a fault. Listen, acknowledge, then offer an alternative that better matches their taste profile — this protects the experience and the house.'
      },
      {
        id: 8,
        type: 'multiple-choice',
        question: 'When opening a bottle of Champagne or sparkling wine, you should:',
        options: [
          'Twist the cork vigorously until it pops loudly',
          'Hold the cork still and twist the bottle slowly, releasing with a soft sigh',
          'Shake the bottle gently to build pressure first',
          'Use a regular corkscrew like any still wine'
        ],
        correct: 1,
        explanation: 'Twist the bottle — not the cork — and aim for a soft sigh rather than a loud pop. Loud pops waste wine and can be dangerous.'
      },
      {
        id: 9,
        type: 'multiple-choice',
        question: 'Why do servers wipe the bottle neck after each pour?',
        options: [
          'To cool the wine faster',
          'To prevent drips and maintain a polished, professional presentation',
          'To check the wine\'s colour',
          'To remove dust from storage'
        ],
        correct: 1,
        explanation: 'Wiping the bottle prevents drips on the tablecloth, linen, or guest — a small detail that communicates professionalism and care.'
      },
      {
        id: 10,
        type: 'multiple-choice',
        question: 'A guest at a table of four asks for "a glass of red." What is the best response?',
        options: [
          'Bring whatever red is cheapest by the glass',
          'Ask if they prefer something light, medium, or full-bodied and offer two or three options',
          'Bring the house red without further discussion',
          'Tell them to look at the wine list themselves'
        ],
        correct: 1,
        explanation: 'Asking about preference before suggesting options demonstrates expertise and drives upsell. Guests appreciate guidance — it feels like service, not selling.'
      }
    ];

    await db.query(`
      INSERT INTO quizzes (module_name, title, questions)
      VALUES ($1, $2, $3)
      ON CONFLICT (module_name, title) DO UPDATE SET questions = EXCLUDED.questions
    `, ['wine-service', 'Wine Service Quiz', JSON.stringify(wineQuestions)]);

    console.log('Curriculum content inserted successfully.');
    res.send(`<!DOCTYPE html><html><head><title>Curriculum Setup</title><style>body{font-family:sans-serif;max-width:600px;margin:60px auto;padding:0 20px;background:#09090b;color:#fafafa;} h1{color:#FF5E3A;} .ok{color:#4ade80;} .item{margin:8px 0;}</style></head><body>
      <h1>Curriculum Setup Complete</h1>
      <div class="ok">✓ 3 difficult-guest role-plays inserted</div>
      <div class="ok">✓ Wine Service Quiz (10 questions) inserted</div>
      <p style="color:#a1a1aa;margin-top:24px;">You can now query the <code>roleplays</code> and <code>quizzes</code> tables. This route is admin-protected and can only be run once per content set (ON CONFLICT DO NOTHING).</p>
      <p><a href="/admin" style="color:#FF5E3A;">← Back to Admin</a></p>
    </body></html>`);
  } catch (e) {
    console.error('Curriculum setup error:', e.message);
    res.status(500).send('Error inserting curriculum: ' + e.message);
  }
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
- 150+ AI roleplay scenarios with an AI guest across 5 categories (Guest Relations, Wine & Beverage, Special Occasions, Rush & Pressure, Health & Safety)
- Voice practice using Whisper AI transcription — speak out loud like the real floor
- Completion certificate (PDF download) after finishing all 30 modules
- Gamification: badges, daily streaks, leaderboard
- Trilingual: English, French, Spanish (EN/FR/ES)
- Manager Dashboard for restaurant owners/managers to track staff progress, assign modules, get weekly digest emails
- PWA — works offline, mobile-first design

Pricing (CAD, all with 14-day free trial):
- Free: $0 — 3 modules, 5 AI scenarios, forever free
- Premium Monthly: $19/mo — all 30 modules, 150+ scenarios, voice roleplay, certificate
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


// ── Scholarship routes ──────────────────────────────────────────────────────────

const scholarshipLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many submissions. Please try again later.' } });

const SCHOLARSHIP_MONTHLY_CAP = 15;
const SCHOLARSHIP_DAYS = 60;

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

app.get('/api/scholarship/spots', async (req, res) => {
  try {
    const used = await getMonthlyApprovedCount();
    res.json({ remaining: Math.max(0, SCHOLARSHIP_MONTHLY_CAP - used), used, cap: SCHOLARSHIP_MONTHLY_CAP });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/scholarship/apply', scholarshipLimiter, express.json(), async (req, res) => {
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
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});


app.get('/api/user/scholarship-status', authMiddleware, async (req, res) => {
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
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/scholarship/testimonial', authMiddleware, express.json(), async (req, res) => {
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
    res.status(500).json({ error: 'Server error' });
  }
});


// ── Influencer / Affiliate Program ────────────────────────────────────────────
const affiliateLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many submissions. Please try again later.' } });

app.post('/api/affiliate/apply', affiliateLimiter, express.json(), async (req, res) => {
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
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Stripe Connect: public refresh URL (Stripe hits this when onboarding link expires) ──
app.get('/api/affiliate/onboarding-refresh/:ref_code', async (req, res) => {
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


// ── Monthly affiliate summary emails (runs daily check, sends on 1st of month) ─
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
      // Auto-update tiers based on prior month conversion count
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
            html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><p style="font-size:16px;line-height:1.7;margin-bottom:8px;">Hi ${safeName},</p><p style="font-size:14px;color:#a3a3a3;margin-bottom:24px;">Here's your affiliate summary for ${prevMonth.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}.</p><div style="display:grid;gap:12px;margin-bottom:24px;"><div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:16px;display:flex;justify-content:space-between;align-items:center;"><span style="color:#a3a3a3;font-size:14px;">New conversions this month</span><span style="color:#FF5E3A;font-weight:700;font-size:18px;">${thisMonth.rows[0].cnt}</span></div><div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:16px;display:flex;justify-content:space-between;align-items:center;"><span style="color:#a3a3a3;font-size:14px;">Earned this month</span><span style="color:#FF5E3A;font-weight:700;font-size:18px;">$${parseFloat(thisMonth.rows[0].earned).toFixed(2)} CAD</span></div><div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:16px;display:flex;justify-content:space-between;align-items:center;"><span style="color:#a3a3a3;font-size:14px;">Pending payout</span><span style="color:#f5f5f5;font-weight:700;font-size:18px;">$${parseFloat(pending.rows[0].total).toFixed(2)} CAD</span></div><div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:16px;display:flex;justify-content:space-between;align-items:center;"><span style="color:#a3a3a3;font-size:14px;">All-time total earned</span><span style="color:#f5f5f5;font-weight:700;font-size:18px;">$${parseFloat(allTime.rows[0].total).toFixed(2)} CAD</span></div></div><p style="font-size:14px;color:#a3a3a3;line-height:1.7;">Your tracking link: <a href="${link}" style="color:#FF5E3A;">${link}</a></p>${parseFloat(pending.rows[0].total) > 0 ? '<p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin-top:12px;">I\'ll be in touch shortly regarding your payout for this month.</p>' : ''}<p style="font-size:16px;line-height:1.7;margin-top:32px;color:#a3a3a3;"><strong style="color:#f5f5f5;">Kirk Adamson</strong><br>Founder, ServeMaster Academy</p></div>`
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

// 404 catch-all — must come after all routes, before the error handler
app.use((req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
});

// Global error handler — must be mounted after all routes
app.use(errorHandler);

const server = app.listen(process.env.PORT || 5000, () => {
  console.log(`Server running on port ${process.env.PORT || 5000}`);
});
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
