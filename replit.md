# ServeMaster Academy

A professional hospitality training platform at `servemasteracademy.ca` — full multi-page marketing site + Google/email auth + training SPA + Stripe pricing + hidden admin dashboard.

## Architecture

- `server.js` — Express backend (port 5000); all routes, auth, AI, Stripe, admin APIs, webhooks, nodemailer
- `app.html` — Training SPA (auth-gated at `/app`)
- `admin.html` — Owner dashboard at `/admin` (DB role check via adminMiddleware)
- `public/` — Marketing pages: home, about, features, pricing, contact, login, signup, privacy, terms, brand
- `stripeClient.js` — Replit Stripe connector helpers
- `db.js` — PostgreSQL connection pool (Replit built-in)

## Pages

| Path | File |
|------|------|
| `/` | `public/home.html` |
| `/about` | `public/about.html` |
| `/features` | `public/features.html` |
| `/pricing` | `public/pricing.html` |
| `/contact` | `public/contact.html` |
| `/login` | `public/login.html` |
| `/signup` | `public/signup.html` |
| `/privacy` | `public/privacy.html` |
| `/terms` | `public/terms.html` |
| `/brand` | `public/brand.html` |
| `/app` | `app.html` (training SPA) |
| `/admin` | `admin.html` (admin dashboard) |

## Subscription Model

| Tier | Price | Stripe Price ID |
|------|-------|----------------|
| Free | $0 | — |
| Individual Monthly | $19/mo | `price_1T6zoHExNgORioBpkHFfppKN` |
| Individual Yearly | $149/yr | `price_1T6zmiExNgORioBp78rqoHQF` |
| Team | $99/mo | `price_1T6zlYExNgORioBp06MwjAnO` |
| Pro Team | $199/mo | `price_1T700zExNgORioBp0eD0BZo1` |
| Enterprise | Custom | Contact sales form (modal on pricing page) |

Checkout plan keys: `premium_monthly`, `premium_annual`, `starter_team`, `pro_team`

## Admin Access

- Visit `/admin` → if not admin, shows diagnostic panel → click "Grant Admin Access to This Account"
- `adminMiddleware` verifies role from **database** (not JWT) — so role upgrades take effect immediately without re-login
- `ADMIN_EMAIL` env var gets admin role auto-granted on server startup

## Key Environment Variables

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | JWT signing secret (set as shared env var) |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Replit OpenAI integration (auto-injected) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Replit OpenAI integration (auto-injected) |
| `DATABASE_URL` | Replit PostgreSQL (auto-injected) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `STRIPE_PREMIUM_MONTHLY_ID` | Stripe price ID |
| `STRIPE_PREMIUM_ANNUAL_ID` | Stripe price ID |
| `STRIPE_STARTER_TEAM_ID` | Stripe price ID |
| `STRIPE_PRO_TEAM_ID` | Stripe price ID |
| `ADMIN_EMAIL` | Auto-granted admin on startup |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_PORT` | Nodemailer (enterprise inquiry emails) |
| `APP_URL` | `https://servemasteracademy.ca` (production) |

## Database Tables

| Table | Purpose |
|-------|---------|
| `users` | Accounts — email, google_id, role, subscription_status, stripe IDs |
| `user_progress` | Module progress + quiz scores |
| `streaks` | Daily login streak tracking |
| `badges` | Earned badge records |
| `scenario_scores` | Completed roleplay sessions |
| `restaurants` | Manager restaurant profiles |
| `invite_codes` | Admin-generated invite codes |
| `invite_code_redemptions` | Code redemption log |
| `email_subscribers` | Newsletter signups |
| `contact_messages` | Contact + enterprise inquiry submissions |
| `sessions` | (legacy, unused) |

## Security

- JWT_SECRET: set as shared env var (48-byte hex)
- adminMiddleware: DB role lookup on every admin request
- Security headers: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy
- Bootstrap endpoint disabled (returns 410)
- Trial expiry check: validates `trial_end` is non-null before comparison

## Analytics & Tracking

- Google Analytics: `G-1BPWXRYVXS` on all 12 pages
- ContentSquare: `2e14c5cc7ec76` on all 12 pages
- `trial_start` GA event fires on email signup and Google OAuth new user

## Features

- 12 training modules, 30 AI roleplay scenarios (3 difficulty levels)
- Whisper voice transcription for voice roleplay
- EN/FR bilingual toggle
- Gamification: streaks, 12 badges, leaderboard
- Completion certificate
- Restaurant Manager dashboard + staff invite system
- Admin invite code generator
- Newsletter capture + enterprise inquiry modal (nodemailer)
- Stripe subscription + trial expiry enforcement

## Deployment

- Workflow: `node server.js` on port 5000
- Deploy target: Autoscale
- Domain: `servemasteracademy.ca`
