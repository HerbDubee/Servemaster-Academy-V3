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
- `public/logo.svg` — Horizontal nav wordmark: gold soundwave icon + white "ServeMaster" + gold "ACADEMY" (dark-bg optimised)
- `public/logo-icon.svg` — Soundwave-only icon for app nav (gold, transparent bg)
- `public/logo.png` — 1200×630 OG/social share image (brand photo on dark navy #071a26)
- `public/logo-transparent.png` — Full stacked logo, transparent background (for footers, dark sections)
- `public/favicon.png` (64px), `public/apple-touch-icon.png` (180px), `public/icon-192.png`, `public/icon-512.png` — PWA/browser icons: gold soundwave on dark navy rounded square
- `stripeClient.js` — Replit Stripe connector helpers
- `db.js` — PostgreSQL connection pool (Replit built-in)
- `public/js/wl-branding.js` — White-label branding injection utility (used on app.html, login.html, signup.html)

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
| `/training` | `public/training.html` (public curriculum preview) |
| `/app/training` | `public/app-training.html` (protected — `requirePaidAccess`) |

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
| `restaurants` | Manager restaurant profiles + `cert_logo_url` + white-label branding columns (`wl_brand_name`, `wl_logo_url`, `wl_primary_color`, `wl_accent_color`, `wl_is_active`, `wl_is_enterprise`) |
| `invite_codes` | Admin-generated invite codes |
| `invite_code_redemptions` | Code redemption log |
| `email_subscribers` | Newsletter signups |
| `contact_messages` | Contact + enterprise inquiry submissions |
| `referrals` | Manager referral tracking |
| `email_drip_log` | Tracks which drip emails have been sent per user (Day 1/3/7/14) |
| `unsubscribe_tokens` | CASL unsubscribe tokens for one-click unsubscribe links |
| `assigned_modules` | Manager-assigned required modules per restaurant |
| `affiliates` | Affiliate accounts — tier, language, payout info, website, commission_rate, activation_bonus |
| `commissions` | Per-sale commission records linked to affiliates |
| `affiliate_payouts` | Payout history with status tracking |
| `roleplays` | Curriculum role-play scenarios — category, title, setup, dialogue, debrief, voice_styles; UNIQUE on title |
| `quizzes` | Curriculum knowledge checks — module_name, title, questions (JSONB); UNIQUE on module+title |

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

## White-Label System

Allows enterprise restaurant clients to brand the training app with their own name, logo, and colours. All branding is app-only (marketing pages remain ServeMaster Academy).

**How it works:**
- Admin creates a tenant via `POST /api/admin/tenants` → generates restaurant + invite link
- Manager saves branding via `POST /api/manager/white-label` (requires `managerMiddleware`)
- On app load, `applyWlBranding()` (from `public/js/wl-branding.js`) calls `GET /api/tenant/branding` and injects CSS custom properties (`--wl-primary`, `--wl-accent`) and swaps the nav logo
- On invite pages (login/signup `?join=CODE`), `applyWlBrandingForInvite(code)` calls `GET /api/tenant/branding/invite?code=` for pre-auth branding
- Nudge emails use `getTenantBrandingForEmail(userId)` to swap from-name, logo, and subject line for white-label tenants

**API endpoints:**
| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/manager/white-label` | managerMiddleware | Load own white-label config |
| `POST /api/manager/white-label` | managerMiddleware | Save branding (brandName, logoUrl, primaryColor, accentColor, isActive) |
| `GET /api/tenant/branding` | authMiddleware | Active branding for logged-in user's restaurant |
| `GET /api/tenant/branding/invite?code=` | public | Pre-auth branding lookup by invite code |
| `GET /api/admin/tenants` | adminMiddleware | List all active/enterprise tenants |
| `PATCH /api/admin/tenants/:id/toggle` | adminMiddleware | Toggle wl_is_active |
| `PATCH /api/admin/tenants/:id/enterprise` | adminMiddleware | Toggle wl_is_enterprise |
| `POST /api/admin/tenants` | adminMiddleware | Create new enterprise tenant |

**Admin panel:** `/admin` → Tenants tab — lists tenants with toggle controls and "New Tenant" modal

## Affiliate Program

Managed entirely from the admin panel (`/admin` → Affiliates tab).

**Commission structure:**
| Plan type | Year 1 rate | Lifetime rate | Activation bonus |
|-----------|------------|---------------|-----------------|
| Individual (premium) | 25% | 10% | — |
| Team (starter/pro) | 30% | 15% | $75 CAD |
| First sale bonus | — | — | $100 CAD welcome bonus |

**DB tables:** `affiliates`, `commissions`, `affiliate_payouts`

**Admin panel features:**
- `renderAffList()` — shows tier badge, language, payout details, website per affiliate
- `renderCommissions()` — shows commission_rate % and activation_bonus column
- `openMarkPaidModal()` / `submitMarkPaid()` — full mark-paid modal flow
- `generateMonthlySummaries()` — monthly affiliate payout summary generation
- `exportAffiliateCSV()` — exports full affiliate list as CSV
- `closeSummariesModal()` — closes the summaries modal

## Curriculum (Role-Plays & Quizzes)

Training content beyond the 30 modules lives in the `roleplays` and `quizzes` DB tables (not `content.js`).

**API endpoints:**
| Endpoint | Purpose |
|----------|---------|
| `GET /api/roleplays?category=` | Returns role-plays by category (default: `difficult-guests`) |
| `GET /api/quizzes?module=` | Returns quizzes by module (default: `wine-service`) |
| `GET /check-curriculum` | Unprotected debug — confirms tables exist and row counts |
| `GET /setup-curriculum` | Admin-protected — seeds initial role-plays and quiz |
| `GET /setup-curriculum-expanded` | Admin-protected — updates debriefs with full structured content |

**Seeded content:**
- 3 difficult-guest role-plays: wine complaint, ignored/hostile guest, policy exception request
- Each debrief includes: primary objective, why it matters, common mistakes, pro tip
- 1 wine service quiz — 10 questions with per-question explanations (JSONB)

**Protected training pages:**
| Route | File | Auth |
|-------|------|------|
| `/training` | `public/training.html` | Public (marketing preview) |
| `/app/training` | `public/app-training.html` | `requirePaidAccess` |

## Manager Dashboard Features

- **Assigned Modules**: Managers select required modules from the full list (Settings tab); stored in `assigned_modules` table; staff see "Required" badge on those modules in app.html
- **Custom Certificate Logo**: Managers enter a logo URL in Settings; stored in `restaurants.cert_logo_url`; served via `GET /api/manager/cert-logo`; used on generated certificates
- **White-Label Branding**: Enterprise managers customise brand name, logo, and colours in Settings → White-Label Branding card (only visible if restaurant has white-label configured)

## App (Training SPA) Features

- **PWA**: `manifest.json` + `sw.js` service worker for offline module text caching
- **Required badges**: Modules assigned by manager show a "Required" badge; loaded via `GET /api/user/assigned-modules`
- **Quiz first-attempt tracking**: `sma-quiz-first-attempts` localStorage key stores first attempt scores; achievements tab shows first vs best
- **Upsell modal**: Shows social proof count + urgency countdown when free user hits a locked module

## Security

- JWT_SECRET: set as shared env var (48-byte hex)
- `adminMiddleware`: DB role lookup on every admin request
- `authMiddleware` + `checkTrial`: used on API routes — returns JSON 401/402 on failure
- `requirePaidAccess`: used on HTML page routes — does its own JWT verification + DB lookup and **redirects** (to `/login` or `/app/upgrade`) instead of returning JSON errors; checks invite window → paid plan → active trial in that order
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
