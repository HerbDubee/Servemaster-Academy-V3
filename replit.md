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

| Tier | Price | Who |
|------|-------|-----|
| Free | $0 | Individual — 3 modules, 5 scenarios |
| Premium Individual | $7.99/mo or $59/yr | Individual — all content |
| Starter Team | $69/mo per location | Manager + up to 10 staff |
| Pro Team | $149/mo per location | Manager + unlimited staff + analytics |
| Enterprise | Contact sales | Multi-location + white label |

- **Individual plans** set `users.subscription_status` = `premium`
- **Team plans** set `restaurants.plan` = `starter_team` or `pro_team`; staff inherit access via `restaurant_id`
- `/api/auth/me` computes and returns `effective_plan` = highest of (user plan OR restaurant plan)
- Gating in `app.html` via `hasPaidPlan()` (any non-free tier) and `isTeamPlan()` helpers
- Plan badge in nav dropdown shows correct tier name (Free / Premium / Starter Team / Pro Team / Enterprise)

## Stripe Price IDs

- Legacy Monthly: `price_1T68eiEYo1GIbgr0JGPS6Bi5` ($19/mo — kept for backwards compat)
- Legacy Annual: `price_1T68eiEYo1GIbgr0vlIaYema` ($149/yr — kept for backwards compat)
- `STRIPE_PREMIUM_MONTHLY_ID` = `price_1T69MUEYo1GIbgr0GjmBhQbL` ($7.99/mo)
- `STRIPE_PREMIUM_ANNUAL_ID` = `price_1T69MUEYo1GIbgr0Vx79VBn2` ($59/yr)
- `STRIPE_STARTER_TEAM_ID` = `price_1T69MVEYo1GIbgr0b3DSeEXF` ($69/mo)
- `STRIPE_PRO_TEAM_ID` = `price_1T69MVEYo1GIbgr0dfPsj7My` ($149/mo)
- Checkout: `POST /api/payments/create-checkout` — accepts plan keys: `premium_monthly`, `premium_annual`, `starter_team`, `pro_team`
- Success: `GET /api/payments/success` → updates user or restaurant plan in DB → redirects to `/app?upgraded=1`
- Cancel: `GET /api/payments/cancel` → redirects to `/pricing`
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
