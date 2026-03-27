# ServeMaster Academy

A professional hospitality training platform at `servemasteracademy.ca` — full multi-page marketing site + Google/email auth + training SPA + Stripe pricing + hidden admin dashboard.

## Architecture

- `server.js` — Express backend (port 5000); all routes, auth, AI, Stripe, admin APIs, webhooks; email via Resend
- `app.html` — Training SPA (auth-gated at `/app`)
- `admin.html` — Owner dashboard at `/admin` (DB role check via adminMiddleware)
- `public/` — Marketing pages: home, about, features, pricing, contact, login, signup, privacy, terms, brand
- `public/blog/` — 106 blog articles (HTML) + index + article template; served via dynamic `/blog/:slug` route
- `public/blog/es/` — 106 Spanish translations of all articles; served at `/blog/es/:slug`
- `public/js/content.js` — Central content store (`window.SMAContent`); single source of truth for modules, lessonData, glossaryTerms, practiceScenarios, blogArticles, blogSections. Loaded by `app.html`, `blog/index.html`, and `blog/article.html`.
- `public/blog/article.html` — Universal blog article template; reads `window.SMAContent.blogArticles` for metadata, then fetches the static HTML body from the slug-specific file.
- `public/unsubscribe.html` — CASL unsubscribe page
- `public/manifest.json` — PWA manifest
- `public/sw.js` — Service worker (offline support)
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
| `/blog` | `public/blog/index.html` (rendered from content.js) |
| `/blog/:slug` | `public/blog/{slug}.html` or `public/blog/article.html` template |
| `/blog/es/:slug` | `public/blog/es/{slug}.html` (Spanish translations) |
| `/admin` | `admin.html` (admin dashboard) |
| `/unsubscribe` | `public/unsubscribe.html` (CASL) |

## Subscription Model

| Tier | Price | Stripe Price ID env var |
|------|-------|----------------|
| Free | $0 | — |
| Individual Monthly | $19/mo | `STRIPE_PREMIUM_MONTHLY_ID` |
| Individual Yearly | $149/yr | `STRIPE_PREMIUM_ANNUAL_ID` |
| Team Starter | $99/mo | `STRIPE_STARTER_TEAM_ID` |
| Team Pro | $199/mo | `STRIPE_PRO_TEAM_ID` |
| Team Starter Annual | $990/yr | `STRIPE_STARTER_TEAM_ANNUAL_ID` |
| Team Pro Annual | $1990/yr | `STRIPE_PRO_TEAM_ANNUAL_ID` |
| Enterprise | Custom | Contact sales form (modal on pricing page) |

Checkout plan keys: `premium_monthly`, `premium_annual`, `starter_team`, `pro_team`, `starter_team_annual`, `pro_team_annual`
Both `premium_monthly` and `premium_annual` normalize to `'premium'` in DB. `PLAN_TIER_ORDER` and `PAID_PLAN_STATUSES` in server.js govern access gating.

The pricing page has a monthly/annual billing toggle. Annual team plans show discounted pricing.

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
| `STRIPE_STARTER_TEAM_ANNUAL_ID` | Stripe price ID (annual team starter) |
| `STRIPE_PRO_TEAM_ANNUAL_ID` | Stripe price ID (annual team pro) |
| `ADMIN_EMAIL` | Auto-granted admin on startup |
| `RESEND_API_KEY` | Resend transactional email (Replit integration, auto-injected) |
| `APP_URL` | `https://servemasteracademy.ca` (production) |

## Database Tables

| Table | Purpose |
|-------|---------|
| `users` | Accounts — email, google_id, role, subscription_status, stripe IDs, `is_unsubscribed` flag |
| `user_progress` | Module progress + quiz scores |
| `streaks` | Daily login streak tracking |
| `badges` | Earned badge records |
| `scenario_scores` | Completed roleplay sessions |
| `restaurants` | Manager restaurant profiles + `cert_logo_url` |
| `invite_codes` | Admin-generated invite codes |
| `invite_code_redemptions` | Code redemption log |
| `email_subscribers` | Newsletter signups |
| `contact_messages` | Contact + enterprise inquiry submissions |
| `referrals` | Manager referral tracking |
| `email_drip_log` | Tracks which drip emails have been sent per user (Day 1/3/7/14) |
| `unsubscribe_tokens` | CASL unsubscribe tokens for one-click unsubscribe links |
| `assigned_modules` | Manager-assigned required modules per restaurant |

### Referral Status State Machine
- **pending**: invite sent, awaiting referred manager signup + checkout
- **credited**: $50 CAD balance credit applied to referrer's Stripe account
- **pending_credit**: referred manager paid but referrer has no Stripe customer yet; credit applied when referrer first checks out
- **closed**: duplicate referral for same referee; another referrer already credited for this user

## Email Automation

- **Drip sequence**: `sendDripEmailIfDue(userId, email, name)` — called on login; Days 1/3/7/14 onboarding sequence tracked via `email_drip_log`
- **Trial drip**: `sendTrialDripEmails(user)` — Days 7/10/13 + expiry emails; all include CASL-compliant unsubscribe footer
- **Weekly manager digest**: `sendWeeklyManagerDigests()` — every Monday; summaries team progress per restaurant; POST `/api/admin/trigger-weekly-digest` for manual trigger
- **Streak recovery**: email sent inside `updateStreak()` when a streak breaks
- **CASL compliance**: `emailFooter(unsubUrl)` appended to all outbound Resend emails; `getOrCreateUnsubToken(userId)` generates persistent tokens; `GET /unsubscribe?token=` + `POST /api/resubscribe`

## Manager Dashboard Features

- **Assigned Modules**: Managers select required modules from the full list (Settings tab); stored in `assigned_modules` table; staff see "Required" badge on those modules in app.html
- **Custom Certificate Logo**: Managers enter a logo URL in Settings; stored in `restaurants.cert_logo_url`; served via `GET /api/manager/cert-logo`; used on generated certificates

## App (Training SPA) Features

- **PWA**: `manifest.json` + `sw.js` service worker for offline module text caching
- **Required badges**: Modules assigned by manager show a "Required" badge; loaded via `GET /api/user/assigned-modules`
- **Quiz first-attempt tracking**: `sma-quiz-first-attempts` localStorage key stores first attempt scores; achievements tab shows first vs best
- **Upsell modal**: Shows social proof count + urgency countdown when free user hits a locked module

## Security

- JWT_SECRET: set as shared env var (48-byte hex)
- adminMiddleware: DB role lookup on every admin request
- Security headers: helmet middleware
- Bootstrap endpoint disabled (returns 410)
- Trial expiry check: validates `trial_end` is non-null before comparison

## Brand Style Guide

- **Headline font**: Montserrat Bold/Black (Google Fonts)
- **Body font**: Inter
- **Primary CTA color**: `#FF5E3A` (brand orange) — all buttons, highlights
- **Secondary color**: `#0A4D68` (deep teal) — hero backgrounds, secondary elements
- **Success**: `#22C55E` | **Warning/Error**: `#EF4444`
- **Dark neutral**: `#1A1A1A` / `#09090b` | **Light neutral**: `#F8F9FA`
- **Footer tagline**: "Shift Smarter. Tip Bigger. Burn Out Less."
- Amber Tailwind utility classes are overridden to brand orange in `tailwind-input.css`
- Run `npm run build:css` after any tailwind-input.css changes

## Navigation Structure

- Home `/` | Academy `/features` | Knowledge Centre `/blog` | AI Role-Play `/app` | Pricing `/pricing` | Scholarship `/scholarship` | About `/about`
- `lang.js` auto-translates nav links via `NAV_HREF_MAP` — update `nav_features`, `nav_blog`, `nav_roleplay` keys there

## Analytics & Tracking

- Google Analytics: `G-1BPWXRYVXS` on all pages
- ContentSquare: `2e14c5cc7ec76` on all pages
- Crisp chat widget on all public marketing pages (replace `REPLACE_WITH_CRISP_WEBSITE_ID` with real ID)
- `trial_start` GA event fires on email signup and Google OAuth new user

## Features

- 30 training modules across two tracks: Fine Dining & Restaurant Service (modules 1–24) and Bar Service (modules 25–30); 150+ AI roleplay scenarios (3 difficulty levels), 51 glossary terms
- Whisper voice transcription for voice roleplay
- EN/FR/ES trilingual toggle
- Gamification: streaks, 12 badges, leaderboard
- Completion certificate (with custom restaurant logo support)
- Restaurant Manager dashboard + staff invite system + assigned required modules
- Admin invite code generator
- Newsletter capture + enterprise inquiry modal
- Stripe subscription + trial expiry enforcement (monthly, annual, team, annual team plans)
- Referral system: servers invite managers → $50 CAD Stripe credit auto-applied on subscription
- CASL-compliant email unsubscribe on all transactional emails

## Deployment

- Workflow: `node server.js` on port 5000
- Deploy target: Autoscale
- Domain: `servemasteracademy.ca`
