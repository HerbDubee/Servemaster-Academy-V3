const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const OpenAI = require('openai').default;
const { toFile } = require('openai');
const { runMigrations } = require('stripe-replit-sync');
const { getUncachableStripeClient, getStripePublishableKey, getStripeSync } = require('./stripeClient');
const db = require('./db');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const app = express();
app.set('trust proxy', 1);
app.use(cookieParser());
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('⚠️  WARNING: JWT_SECRET env var is not set. Using insecure fallback. Set JWT_SECRET in production!');
  return 'servemaster-secret-key-2025';
})();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

const STRIPE_PREMIUM_MONTHLY_ID = process.env.STRIPE_PREMIUM_MONTHLY_ID || '';
const STRIPE_PREMIUM_ANNUAL_ID = process.env.STRIPE_PREMIUM_ANNUAL_ID || '';
const STRIPE_STARTER_TEAM_ID = process.env.STRIPE_STARTER_TEAM_ID || '';
const STRIPE_PRO_TEAM_ID = process.env.STRIPE_PRO_TEAM_ID || '';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'herb.dubee@gmail.com';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@servemasteracademy.ca';
const HELLO_EMAIL = process.env.HELLO_EMAIL || 'hello@servemasteracademy.ca';
const INFO_EMAIL = process.env.INFO_EMAIL || 'info@servemasteracademy.ca';

const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE_OPTS = { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax', secure: IS_PROD };

const PLAN_TIER_ORDER = ['free', 'premium', 'starter_team', 'pro_team', 'enterprise'];
function highestPlan(a, b) {
  const ai = PLAN_TIER_ORDER.indexOf(a || 'free');
  const bi = PLAN_TIER_ORDER.indexOf(b || 'free');
  return ai >= bi ? (a || 'free') : (b || 'free');
}

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});
const whisperKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const whisperClient = new OpenAI({ apiKey: whisperKey });

// ── Stripe webhook (must be BEFORE express.json) ──────────────────────────────
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  if (!signature) return res.status(400).json({ error: 'Missing stripe-signature' });
  try {
    const sync = await getStripeSync();
    const sig = Array.isArray(signature) ? signature[0] : signature;
    await sync.processWebhook(req.body, sig);
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(400).json({ error: 'Webhook processing error' });
  }
});

app.use(express.json());

// ── Auth middleware ────────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

function adminMiddleware(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access only' });
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
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
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'public', 'contact.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'public', 'terms.html')));
app.get('/brand', (req, res) => res.sendFile(path.join(__dirname, 'public', 'brand.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'app.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.get('/api/admin/bootstrap', async (req, res) => {
  const BOOTSTRAP_KEY = process.env.BOOTSTRAP_KEY || 'sma-admin-2026';
  const { key, email } = req.query;
  if (!key || key !== BOOTSTRAP_KEY) return res.status(403).json({ error: 'Invalid key' });
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    const result = await db.query('SELECT id, email, role FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found', email });
    const user = result.rows[0];
    await db.query("UPDATE users SET role = 'admin', subscription_status = 'premium' WHERE id = $1", [user.id]);
    res.json({ success: true, message: `${user.email} is now admin + premium`, id: user.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name, level } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Missing required fields' });
  try {
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users (email, password_hash, name, experience_level) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [email.toLowerCase(), hash, name, level || 'New to serving']
    );
    const user = result.rows[0];
    await db.query('INSERT INTO streaks (user_id) VALUES ($1)', [user.id]);
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('token', token, COOKIE_OPTS);
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, token });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
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
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, experience_level: user.experience_level, subscription_status: user.subscription_status || 'free' }, token });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const result = await db.query('SELECT id, name, email, role, experience_level, restaurant_id, subscription_status FROM users WHERE id = $1', [req.user.id]);
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
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.get('/api/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.redirect('/login?error=google_not_configured');
  const BASE_URL = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${BASE_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline'
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/login?error=google_auth_failed');
  try {
    const BASE_URL = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
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
    const profileRes = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${tokens.access_token}`);
    const profile = await profileRes.json();
    let userResult = await db.query('SELECT * FROM users WHERE google_id = $1', [profile.sub]);
    let user;
    if (!userResult.rows.length) {
      const existing = await db.query('SELECT * FROM users WHERE email = $1', [profile.email]);
      if (existing.rows.length) {
        await db.query('UPDATE users SET google_id = $1 WHERE id = $2', [profile.sub, existing.rows[0].id]);
        user = existing.rows[0];
      } else {
        const ins = await db.query(
          'INSERT INTO users (email, google_id, name, experience_level) VALUES ($1, $2, $3, $4) RETURNING *',
          [profile.email, profile.sub, profile.name, 'New to serving']
        );
        user = ins.rows[0];
        await db.query('INSERT INTO streaks (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
      }
    } else { user = userResult.rows[0]; }
    await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    await updateStreak(user.id);
    if (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && user.role !== 'admin') {
      await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]);
      user.role = 'admin';
    }
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.redirect('/login?token=' + encodeURIComponent(token));
  } catch (err) {
    console.error('Google auth error:', err.message);
    res.redirect('/login?error=google_auth_failed');
  }
});

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

app.get('/api/user/progress', authMiddleware, async (req, res) => {
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

app.post('/api/user/progress', authMiddleware, async (req, res) => {
  const { moduleId, progress, quizScore } = req.body;
  if (!moduleId) return res.status(400).json({ error: 'moduleId required' });
  try {
    const completed = progress >= 100 ? new Date() : null;
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
  } catch (err) { res.status(500).json({ error: 'Failed to save progress' }); }
});

app.post('/api/user/scenario', authMiddleware, async (req, res) => {
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

app.post('/api/newsletter/subscribe', async (req, res) => {
  const { email, firstName } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    await db.query('INSERT INTO email_subscribers (email, first_name) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET active = TRUE', [email.toLowerCase(), firstName || '']);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Subscription failed' }); }
});

app.post('/api/contact', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'All fields required' });
  try {
    await db.query('INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3)', [name, email.toLowerCase(), message]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to send message' }); }
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
app.get('/api/payments/publishable-key', async (req, res) => {
  try {
    const key = await getStripePublishableKey();
    res.json({ key });
  } catch (err) { res.status(500).json({ error: 'Could not retrieve Stripe key' }); }
});

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
      success_url: `${baseUrl}/api/payments/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

app.get('/api/payments/success', async (req, res) => {
  const { session_id } = req.query;
  try {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(session_id, { expand: ['metadata'] });
    if (session.payment_status === 'paid' || session.status === 'complete') {
      const customerId = session.customer;
      const plan = session.metadata?.plan || 'premium';
      const isTeamPlan = plan === 'starter_team' || plan === 'pro_team';
      if (isTeamPlan && session.metadata?.restaurantId) {
        await db.query(
          'UPDATE restaurants SET plan = $1 WHERE id = $2',
          [plan, parseInt(session.metadata.restaurantId)]
        );
        await db.query(
          'UPDATE users SET stripe_subscription_id = $1 WHERE stripe_customer_id = $2',
          [session.subscription, customerId]
        );
      } else {
        await db.query(
          'UPDATE users SET subscription_status = $1, stripe_subscription_id = $2 WHERE stripe_customer_id = $3',
          [plan === 'premium_annual' ? 'premium' : plan, session.subscription, customerId]
        );
      }
    }
    res.redirect('/app?upgraded=1');
  } catch (err) {
    console.error('Payment success error:', err.message);
    res.redirect('/app');
  }
});

app.get('/api/payments/cancel', (req, res) => res.redirect('/pricing'));

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

app.delete('/api/admin/invite-codes/:code', adminMiddleware, async (req, res) => {
  try {
    await db.query('DELETE FROM invite_codes WHERE code = $1', [req.params.code]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete invite code' }); }
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
    await db.query('UPDATE users SET subscription_status = $1 WHERE id = $2', [ic.plan, req.user.id]);
    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];
    const restaurant = user.restaurant_id ? (await db.query('SELECT * FROM restaurants WHERE id = $1', [user.restaurant_id])).rows[0] : null;
    const effective_plan = highestPlan(user.subscription_status, restaurant?.plan);
    res.json({ ok: true, plan: ic.plan, effective_plan });
  } catch (err) { res.status(500).json({ error: 'Failed to redeem invite code' }); }
});

// ── AI routes ─────────────────────────────────────────────────────────────────
app.post('/api/transcribe', authMiddleware, upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file provided' });
  try {
    const audioFile = await toFile(req.file.buffer, 'audio.webm', { type: req.file.mimetype || 'audio/webm' });
    const transcription = await whisperClient.audio.transcriptions.create({
      file: audioFile, model: 'whisper-1',
      language: req.body.lang === 'fr' ? 'fr' : 'en',
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
  4: { title: 'The Long Wait Complaint', systemPrompt: `You are a guest who has been waiting 45 minutes for your main course. You are not aggressive, but clearly frustrated and hungry. Your dining companion is also visibly unhappy. The user is playing the server who must acknowledge the wait, apologise sincerely, and resolve the situation. Respond realistically to genuine apologies versus hollow ones.` },
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

app.post('/api/roleplay', authMiddleware, async (req, res) => {
  const { scenarioId, messages } = req.body;
  const scenario = scenarios[scenarioId];
  if (!scenario) return res.status(400).json({ error: 'Invalid scenario' });
  const thirdPersonWrapper = `NARRATION STYLE — IMPORTANT: Always narrate the customer in third person. Never speak as the customer in first person ("I want...", "I'm angry..."). Instead, describe what the customer says and does as a narrator: "The customer frowns and says: '...'", "He crosses his arms and replies: '...'", "She sighs and asks: '...'". Use "the customer", "he", "she", or "they" throughout. Describe body language and tone alongside dialogue.\n\n`;
  const systemContent = thirdPersonWrapper + scenario.systemPrompt;
  try {
    const completion = await openai.chat.completions.create({
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

app.post('/api/roleplay/summary', authMiddleware, async (req, res) => {
  const { scenarioId, messages } = req.body;
  const scenario = scenarios[scenarioId];
  if (!scenario) return res.status(400).json({ error: 'Invalid scenario' });
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
}`;
  try {
    const completion = await openai.chat.completions.create({
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
    await runMigrations({ databaseUrl });
    const stripeSync = await getStripeSync();
    const domains = process.env.REPLIT_DOMAINS?.split(',')[0];
    if (domains) {
      const webhookUrl = `https://${domains}/api/stripe/webhook`;
      await stripeSync.findOrCreateManagedWebhook(webhookUrl);
    }
    stripeSync.syncBackfill().catch(e => console.error('Stripe backfill error:', e.message));
    console.log('Stripe initialized');
  } catch (err) {
    console.warn('Stripe init warning (non-fatal):', err.message);
  }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`ServeMaster Academy running on port ${PORT}`);
  try {
    const updated = await db.query(
      "UPDATE users SET role = 'admin', subscription_status = 'premium' WHERE email = $1 AND role != 'admin' RETURNING email",
      [ADMIN_EMAIL]
    );
    if (updated.rows.length) console.log(`Admin role granted to ${ADMIN_EMAIL} on startup`);
  } catch (e) {}
  await initStripe();
});
