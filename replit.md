# ServeMaster Academy

A professional hospitality training platform — full multi-page marketing site + auth-gated training SPA + Stripe-powered Pro tier + hidden admin dashboard.

## Architecture

- `server.js` — Express backend (port 5000); all routes, auth, AI, Stripe payments, admin APIs, webhooks
- `app.html` — Training SPA (auth-gated at `/app`; served only to logged-in users)
- `index.html` — Legacy copy of app.html (kept for reference; not served)
- `admin.html` — Owner dashboard at `/admin` (requires admin JWT role)
- `public/` — Marketing HTML pages (home, about, features, pricing, contact, login, signup)
- `stripeClient.js` — Replit Stripe connector helpers (getUncachableStripeClient, getStripeSync, getStripePublishableKey)
- `db.js` — PostgreSQL connection pool (Replit built-in Neon database)

## Routes

| Path | Serves |
|------|--------|
| `/` | `public/home.html` (marketing home) |
| `/about` | `public/about.html` |
| `/features` | `public/features.html` |
| `/pricing` | `public/pricing.html` |
| `/contact` | `public/contact.html` |
| `/login` | `public/login.html` |
| `/signup` | `public/signup.html` |
| `/app` | `app.html` (training SPA, auth-gated client-side) |
| `/admin` | `admin.html` (owner dashboard, 401 if no admin token) |

## Subscription Model

- **Free**: 3 modules, 5 scenarios, progress tracking, badges/streaks
- **Pro** ($19/mo or $149/yr): All 12 modules, all 30 scenarios, voice roleplay, completion certificate, global leaderboard

Pro gating enforced in `app.html` via `isPro()` helper:
- Modules 4–12 show greyed-out locked cards → `/pricing`
- Scenarios 6–30 show upgrade prompt after scenario 5
- Voice input blocked for free users
- Certificate download blocked for free users
- Leaderboard shows upgrade prompt for free users
- User dropdown shows plan badge (Free / ⭐ Pro) and "Upgrade to Pro" link (hidden for Pro users)

## Stripe

- Monthly price ID: `price_1T68eiEYo1GIbgr0JGPS6Bi5` ($19/mo)
- Annual price ID: `price_1T68eiEYo1GIbgr0vlIaYema` ($149/yr)
- Checkout route: `POST /api/payments/create-checkout`
- Success route: `GET /api/payments/success` → upgrades user in DB → redirects to `/app?upgraded=1`
- Cancel route: `GET /api/payments/cancel` → redirects to `/pricing`
- Webhook: `POST /api/stripe/webhook` (must be before `express.json()`)

## Admin Dashboard

Access: Set `role = 'admin'` in DB for your email, then visit `/admin`.
API endpoints (all require admin JWT):
- `GET /api/admin/overview` — stats (users, revenue, activity)
- `GET /api/admin/users` — user list with plan + progress
- `GET /api/admin/modules` — module completion stats
- `GET /api/admin/newsletter` — subscriber list
- `GET /api/admin/restaurants` — restaurant accounts
- `GET /api/admin/contacts` — contact form submissions

## Features

### Core Training
- 12 learning modules with expandable lessons, FR/EN translations, and quizzes
- Progress tracking synced to PostgreSQL; localStorage fallback
- 30 AI roleplay scenarios categorised by difficulty

### User Accounts
- Email + password registration and login
- Google OAuth login (requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET)
- JWT token auth (30-day sessions; stored in localStorage as `sma-token`)
- Cross-device progress sync via PostgreSQL

### Gamification
- Daily login streaks
- 12 badges with unlock logic
- Leaderboard (Pro only)

### Other
- Completion certificate PDF via jsPDF (Pro only)
- EN/FR language toggle (persisted in localStorage)
- Restaurant Manager dashboard (invite code system)
- Tray Balance Simulator (gyroscope/mouse)
- 25-term bilingual hospitality glossary
- Newsletter email capture

## Key Environment Variables

- `AI_INTEGRATIONS_OPENAI_API_KEY` — Replit OpenAI integration (auto-injected)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — Replit OpenAI integration (auto-injected)
- `OPENAI_API_KEY` — Direct OpenAI key for Whisper voice transcription
- `DATABASE_URL` — Replit built-in PostgreSQL (auto-injected)
- `JWT_SECRET` — Secret for JWT signing (set in Secrets for production)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth (optional)

## Database Schema

- `users` — Accounts; columns include `subscription_status` (free/pro), `stripe_customer_id`, `stripe_subscription_id`, `role`
- `user_progress` — Module progress + quiz scores per user
- `streaks` — Daily login streak tracking
- `badges` — Earned badge records
- `scenario_scores` — Completed role-play session records
- `restaurants` — Manager restaurant profiles + invite codes
- `email_subscribers` — Newsletter signups
- `contact_messages` — Contact form submissions

## Deployment

- Workflow: `node server.js` on port 5000
- Stripe webhook registered automatically via `stripeSync.findOrCreateManagedWebhook()` on startup
