# ServeMaster Academy

A professional hospitality training platform at `servemasteracademy.ca` — multi-page marketing site + Google/email auth + training SPA + Stripe pricing + hidden admin dashboard. Express backend on port 5000, PostgreSQL, server-rendered HTML pages with inline scripts (no SPA framework).

## User Preferences

- **Git is pushed manually by the user** in the Replit Shell. Several git write commands are blocked for the agent — never assume a commit/push happened; the user handles version control.
- Keep this file concise: it's an orientation map, not exhaustive API docs (those are derivable from the route files).

## Architecture

Backend is `server.js` (startup, middleware, page routes, shared helpers, schema-migration IIFE) plus feature routers under `routes/` and shared helpers under `lib/`.

**Routers (`routes/`):**
- `auth.js` — Google OAuth credential flow + logout (mounted **before** `express.json`)
- `auth-email.js` — register, login, logout, forgot/reset-password, `/api/auth/me`, Google OAuth redirect+callback
- `stripe.js` — Stripe webhook (raw body), checkout, billing portal, payment status (mounted **before** `express.json` for raw webhook body)
- `manager.js` — all `/api/manager/*` (dashboard, staff, nudge, certificates, training plans, skill-gap, export, white-label, digest, deadline, assigned modules)
- `admin.js` — core `/api/admin/*` (tenants, users, modules, newsletter, scholarships, analytics, digest triggers)
- `admin-affiliates.js` — `/api/admin/affiliates/*` (CRUD, approve/reject, commissions, Stripe Connect, payouts, CSV export)
- `user.js` — progress, streaks, badges, scenarios, transcription, TTS, certificates, referrals, team
- `contact.js` — newsletter, contact form, enterprise inquiry, team-trial, referral invite, invite redeem
- `curriculum.js` — roleplays, quizzes, chat config, AI chat stream, curriculum setup
- `features.js` — unsubscribe flow, scholarship applications, affiliate program, monthly affiliate email

**Shared libs (`lib/`):**
- `emailHelpers.js` — `escapeHtml`, `getTenantBrandingForEmail`, drip/digest helpers
- `digests.js` — weekly attribution + digest builders (`createDigests({ db, resend, escapeHtml, APP_URL })`)
- `cronJobs.js` — three Monday-digest cron schedulers
- `logger.js` — dependency-free structured logger (JSON in prod, pretty in dev, `LOG_LEVEL`-gated)
- `schemas.js` — Zod request schemas; `middleware/validate.js` is the validation middleware (see Conventions)

**Middleware (`middleware/`):** `requestLogger.js` (per-request log + `X-Request-Id`), `errorHandler.js` (centralized), `validate.js` (Zod).

**Frontend:**
- `app.html` — training SPA (auth-gated `/app`); `admin.html` — owner dashboard (`/admin`, DB role check)
- `public/manager-dashboard.html` — manager sidebar SPA (`/manager-dashboard`), separate from admin
- `public/` — marketing pages (home, about, features, pricing, contact, login, signup, privacy, terms, brand)
- `public/blog/` — 106 articles + `public/blog/es/` Spanish translations; served via dynamic `/blog/:slug`
- `public/js/content.js` — central content store (`window.SMAContent`): single source of truth for modules, lessons, glossary, scenarios, blogArticles. Loaded by `app.html`, `blog/index.html`, `blog/article.html`
- `public/blog/article.html` — universal article template (reads `SMAContent.blogArticles` metadata, fetches static HTML body)
- `public/js/wl-branding.js` — white-label branding injection (app.html, login, signup)
- `public/sw.js` + `manifest.json` — PWA / offline
- Logos/icons: `logo.svg` (nav wordmark), `logo-icon.svg` (app nav), `logo.png` (1200×630 OG), `logo-transparent.png`, `favicon.png`/`apple-touch-icon.png`/`icon-192.png`/`icon-512.png`

**Infra:** `db.js` (pg Pool, Replit Postgres), `stripeClient.js` (Replit Stripe connector helpers).

## Pages

| Path | File |
|------|------|
| `/`, `/about`, `/features`, `/pricing`, `/contact`, `/login`, `/signup`, `/privacy`, `/terms`, `/brand` | matching `public/*.html` |
| `/app` | `app.html` (training SPA) |
| `/admin` | `admin.html` |
| `/manager-dashboard` | `public/manager-dashboard.html` |
| `/blog` | `public/blog/index.html` (rendered from content.js) |
| `/blog/:slug` | `public/blog/{slug}.html` or `article.html` template |
| `/blog/es/:slug` | `public/blog/es/{slug}.html` |
| `/training` | `public/training.html` (public curriculum preview) |
| `/app/training` | `public/app-training.html` (protected — `requirePaidAccess`) |
| `/unsubscribe` | `public/unsubscribe.html` (CASL) |

## Subscription Model

| Tier | Price | Price ID env var |
|------|-------|----------------|
| Free | $0 | — |
| Individual Monthly | $19/mo | `STRIPE_PREMIUM_MONTHLY_ID` |
| Individual Yearly | $149/yr | `STRIPE_PREMIUM_ANNUAL_ID` |
| Team Starter | $99/mo | `STRIPE_STARTER_TEAM_ID` |
| Team Pro | $199/mo | `STRIPE_PRO_TEAM_ID` |
| Team Starter Annual | $990/yr | `STRIPE_STARTER_TEAM_ANNUAL_ID` |
| Team Pro Annual | $1990/yr | `STRIPE_PRO_TEAM_ANNUAL_ID` |
| Enterprise | Custom | Contact sales form (modal on pricing page) |

Checkout plan keys: `premium_monthly`, `premium_annual`, `starter_team`, `pro_team`, `starter_team_annual`, `pro_team_annual`. Both premium keys normalize to `'premium'` in DB. `PLAN_TIER_ORDER` and `PAID_PLAN_STATUSES` in server.js govern access gating. Pricing page has a monthly/annual toggle.

## Admin Access

- Visit `/admin` → if not admin, a diagnostic panel offers "Grant Admin Access to This Account".
- `adminMiddleware` / `managerMiddleware` verify role from the **database** (not the JWT) on every request — so role changes take effect immediately without re-login.
- `ADMIN_EMAIL` env var is auto-granted admin role on server startup.

## Key Environment Variables

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | JWT signing secret |
| `DATABASE_URL` | Replit PostgreSQL (auto-injected) |
| `AI_INTEGRATIONS_OPENAI_API_KEY` / `_BASE_URL` | Replit OpenAI integration (auto-injected) |
| `RESEND_API_KEY` | Resend email (Replit integration, auto-injected) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `STRIPE_PREMIUM_MONTHLY_ID`, `STRIPE_PREMIUM_ANNUAL_ID`, `STRIPE_STARTER_TEAM_ID`, `STRIPE_PRO_TEAM_ID`, `STRIPE_STARTER_TEAM_ANNUAL_ID`, `STRIPE_PRO_TEAM_ANNUAL_ID` | Stripe price IDs |
| `ADMIN_EMAIL` | Auto-granted admin on startup |
| `APP_URL` | `https://servemasteracademy.ca` (production) |
| `SENTRY_DSN` | Sentry error monitoring (optional — Sentry stays off if unset) |

## Conventions

**Input validation (Zod):** Schemas live in `lib/schemas.js`; `validate(schema, source='body')` in `middleware/validate.js` returns `400 { error, issues }` on failure and replaces `req[source]` with parsed data. Middleware order is **rate-limiter → auth → validate → handler** (so abusive traffic is capped first and unauthenticated requests fail 401 before validation). Zod strips unknown keys, so every body key a handler reads must be in the schema. Currently wired on auth/payment/contact routes; manager/admin not yet.

**Logging / errors:** Use `lib/logger.js` for structured logs. `requestLogger` logs every request on finish with a correlation ID. Route handlers surface server errors via `next(err)` so they reach the centralized `errorHandler` (which classifies status and reports 5xx to Sentry). To keep the original endpoint-specific client message while still forwarding the real error (so Sentry/logs retain the true stack and `err.message`), catch blocks attach a curated message: `next(Object.assign(err, { publicMessage: 'Failed to fetch tenants' }))`. `errorHandler` returns `{ error: <publicMessage> }` with status 500 (any 4xx/5xx `err.status` is honored if also set). Without a `publicMessage`, an unexpected 500 falls back to a generic message in prod / `err.message` in dev (so don't leak internals). A handful of intentional exceptions keep their inline `res.status(500)`: non-JSON `.send()` text responses (`curriculum.js`, `features.js`), the Stripe webhook-secret config guard (`stripe.js`), the streaming/`headersSent` TTS guard and `fallback:true` transcription response (`user.js`), and the `{ verified:false }` custom shape (`manager.js`). Preserve the `{ error: ... }` 500 body shape.

**Error monitoring (Sentry):** `instrument.js` is required as the **first line of server.js** (before express) and inits Sentry only if `SENTRY_DSN` is set — otherwise it no-ops. Configured for errors only (`tracesSampleRate: 0`). Process-level crashes (`unhandledRejection`, `uncaughtException`) are handled by Sentry's **default integrations** (no custom `process.on` handlers — they would double-capture): unhandled rejections are captured and serving continues; uncaught exceptions are captured, flushed, then the process exits. `middleware/errorHandler.js` reports 5xx to Sentry with request context (path, method, reqId, user id); 4xx are not sent. Alert rules are configured in the Sentry dashboard, not in code. Route catch blocks now `next(err)` so server 500s reach Sentry; only the intentional inline `res.status(500)` exceptions listed under Logging / errors stay outside that path (they are config guards, non-JSON text, or graceful fallbacks — not unexpected server errors).

**Router mount order:** Routers that read `req.body` must mount **after** `express.json()`. The Stripe and OAuth routers mount before it on purpose (raw webhook body / credential flow); any Stripe route needing JSON attaches its own `express.json()` inline.

**CSP:** Helmet sends a Content-Security-Policy allowlisting the third-party origins the site uses (Stripe, Google Fonts/Tag Manager, ContentSquare, Tailwind/cdnjs/jsDelivr, YouTube). `'unsafe-inline'`/`'unsafe-eval'` and `script-src-attr 'unsafe-inline'` are required because the pages use hundreds of inline scripts/handlers and the Tailwind Play CDN. `upgrade-insecure-requests` is production-only.

**Module ↔ scenario integrity:** The training SPA (`app.html`) renders each module's practice scenarios by resolving `modules[].scenarioIds` against `practiceScenarios` (id lookup) in `public/js/content.js`; `lib/tracks.js` `MODULE_SCENARIOS` mirrors the same mapping for server-side completion/gating. Keep the two in lockstep. Verify with `node scripts/check-module-scenarios.js` (registered as the `module-scenarios` validation): it asserts every `scenarioId` resolves, each scenario's own `moduleId` points back to its owning module (on-topic), `MODULE_SCENARIOS` matches `scenarioIds` exactly, all trilingual fields (EN/FR/ES title/desc/scene) are present, and no scenario is orphaned or double-referenced. Run it after any module rename or scenario id change. **Scenario-count distribution:** every module carries exactly **5** practice scenarios except the two advanced deep-dive modules — 15 (Wine Pairing Under Time Pressure) and 16 (Allergens & Special Requests at Depth) — which each carry a deliberate **6th** on-topic scenario (the correctly re-homed cocktail/halal scenarios). This is intentional depth, not clutter; keep it in mind before "balancing" counts. The same script also runs an **advisory topic-drift pass** (`checkTopicDrift`): it scans each scenario's title+description — in all three languages (EN, FR, and ES; `DOMAIN_LEXICON` carries per-language word lists and matching is accent-insensitive) — for a strong, concrete subject (wine, cocktails, spirits, beer, coffee/tea, allergens, payment, reservations) and *warns* — never fails, so it can't break the validation — on two patterns. **Island drift:** a single scenario reads as a subject (≥ its `SUBJECT_MIN_HITS` bar, default 2; `spirits` is high-signal at 1 since spirit names rarely appear off-topic — whisky/whiskey live in `spirits`, not `cocktail`, and plain `rye` is excluded to avoid rye-bread noise) that is absent from the module's title, lesson curriculum (same language), and every sibling scenario's naming. **Cluster drift:** a strict majority of ≥3 of a module's scenarios share one subject (per-scenario bar of just 1 hit — the count is the corroboration) that the module's title/lessons cover nowhere; this catches off-topic scenarios that mutually "support" each other as siblings, which the island check alone misses. Each language is judged independently, so a copy edit that drifts only the FR or ES wording off-topic still surfaces (the warning names which language). It's deliberately conservative so drift surfaces without drowning in false positives. **Human-reviewed island false positives are suppressed via the `REVIEWED_DRIFT_ALLOWLIST` in the script (keyed by scenario id + language + subject) — so a clean run prints e.g. "N topic-drift warning(s) (6 reviewed false positive(s) suppressed)" and any NEW drift stands out immediately.** The suppressed cases (documented inline in the allowlist): scenario 87 "The Mocktail Menu" (module 14 Basic Menu Navigation) is beverage-menu navigation sitting beside its coffee/tea siblings — the "cocktail" signal is just mocktail vocabulary; scenario 126 "The Online Reservation Mixup" (module 20 Recovering from Service Errors) is one more service error to recover from beside wrong-order/spill/POS siblings — flagged only in ES because the Spanish copy repeats "reserva"; scenario 145 "The Batched Cocktail Service" (module 27 Speed Without Sacrificing Warmth) is a bar-speed scenario beside its Shake-vs-Stir/Free-Pour/Citrus-Prep cocktail siblings — flagged only in FR/ES because those sibling titles don't carry the literal "cocktail" lexicon word. If any of these scenarios is ever re-themed onto a new subject, remove its allowlist entry so the heuristic re-checks it. **Cluster drift is not allowlisted and currently flags module 28 (High-Pressure VIP & Celebrity Service):** 4 of its 5 scenarios are cocktail deep-dives with no cocktail theme in the title/lessons — a real signal left as-is (re-homing is a content task, not a checker fix). The checker exports its internals when `require`d (not run as CLI) for unit-testing the drift logic.

## Manager Dashboard

A user becomes a manager by `POST /api/manager/create-restaurant` (creates a `restaurants` row with an 8-char `invite_code`, promotes the caller to `role='manager'`, sets `restaurant_id`). Others join via `POST /api/manager/join { inviteCode }` (sets `restaurant_id` without changing role — for co-managers). Shareable invite URL: `https://servemasteracademy.ca/join?code=XXXXXXXX`.

All `/api/manager/*` routes are gated by `managerMiddleware` (`role` manager or admin, re-read from DB each request). Features (see `routes/manager.js` for exact endpoints): team overview + per-staff drill-down, send-nudge emails, issue certificates (marks all 30 modules complete), assigned/required modules, per-staff training plans with due dates, skill-gap report, CSV/PDF progress export, weekly email digest toggle, training deadline, certificate logo.

**White-label branding (Enterprise):** stored as `wl_*` columns on `restaurants` (`wl_brand_name`, `wl_logo_url` must be `https://`, `wl_primary_color`/`wl_accent_color` validated `#rrggbb`, `wl_is_active` master switch, `wl_is_enterprise`). The training SPA fetches `/api/tenant/branding[/invite?code=]` and injects colours as CSS custom properties + swaps the logo. Branding also flows into nudge/digest emails via `getTenantBrandingForEmail(managerId)`; the "Powered by ServeMaster" email footer is hidden for enterprise.

## Database Tables

| Table | Purpose |
|-------|---------|
| `users` | Accounts — email, google_id, role (`server`/`manager`/`admin`), restaurant_id, subscription_status, stripe IDs, `weekly_digest_enabled`, `is_unsubscribed` |
| `user_progress` | Module progress + quiz scores |
| `streaks` | Daily login streak tracking |
| `badges` | Earned badge records |
| `scenario_scores` | Completed roleplay sessions |
| `restaurants` | One row per tenant — `invite_code`, `training_deadline`, `cert_logo_url`, `wl_*` branding columns |
| `assigned_modules` | `(restaurant_id, module_id)` required modules per tenant (unique) |
| `training_plans` | Per-staff plan header (`restaurant_id`, `user_id`, `title`, `created_by`) |
| `training_plan_items` | `(plan_id, module_id, position, due_date)` |
| `certificates` | Log of every certificate issued (`user_id`, `issued_by`, `issued_at`) |
| `invite_codes`, `invite_code_redemptions` | Admin-generated invite codes + redemption log |
| `email_subscribers` | Newsletter signups |
| `contact_messages` | Contact + enterprise + team-trial submissions |
| `referrals` | Manager referral tracking (state machine below) |
| `email_drip_log` | Which drip emails sent per user (Day 1/3/7/14) |
| `unsubscribe_tokens` | CASL one-click unsubscribe tokens |
| `affiliates`, `commissions`, `affiliate_payouts` | Affiliate accounts, per-sale commissions, payout history |
| `roleplays` | Curriculum role-plays — category, title, setup, dialogue, debrief, voice_styles; UNIQUE on title |
| `quizzes` | Curriculum knowledge checks — module_name, title, questions (JSONB); UNIQUE on module+title |

**Referral status state machine:** `pending` (invite sent) → `credited` ($50 CAD Stripe balance credit applied) / `pending_credit` (referee paid but referrer has no Stripe customer yet — credited on their first checkout) / `closed` (duplicate referral; another referrer already credited).

## Sitemap Freshness

Static (non-blog) sitemap entries live in `lib/staticFreshness.js` (`STATIC_PAGES`: path → backing HTML file + `baseline`/priority/changefreq). The `/sitemap.xml` route self-heals: at startup it sets each page's `<lastmod>` to the **more recent** of its declared `baseline` and the HTML file's last git-commit date (`buildStaticSitemapRows`), so dates freshen automatically as pages are updated — never going backwards if git history is unavailable. Keep baselines honest with `node scripts/check-sitemap-freshness.js` (non-zero exit if a baseline is older than the file's last commit; registered as the `sitemap-freshness` validation). Auto-bump stale baselines with `node scripts/fix-sitemap-freshness.js`, then re-check. When adding a new static page route, add it to `STATIC_PAGES` too.

## Blog Conventions

**Freshness (`dateModified`):** Each `blogArticles` entry in `public/js/content.js` has `datePublished` (never changes) and `dateModified` (bump to today in `YYYY-MM-DD` **whenever the article's HTML is meaningfully revised** — Google reads it from JSON-LD for freshness). Check drift with `node scripts/check-blog-freshness.js` (compares declared date vs last git-commit date of the HTML file; non-zero exit if stale). Auto-fix all with `node scripts/fix-blog-freshness.js`, then re-check. Run after any blog editing session.

**Category / OG image:** Every post needs `<meta name="blog-category" content="...">` in `<head>` (after `og:image:height`). Values → OG image: `server-skills` (front-of-house), `bartending` (behind-the-bar craft), `management` (running a team/venue).

**Audio (Listen button) & durable storage:** Pre-generated MP3s live at `public/audio/blog/{lang}/{slug}.mp3` — **gitignored & ephemeral** (~1.9 GB, never commit), so they're also persisted in Replit Object Storage (`lib/blogAudioStore.js`, stored at `PRIVATE_OBJECT_DIR/blog-audio/{lang}/{slug}.mp3`). `lib/blogAudioStore.js` and `lib/bookAudioStore.js` are both thin wrappers over the shared `lib/audioObjectStore.js` factory (Range-aware streaming). The **public, no-auth** route `/api/blog/tts/:lang/:slug` validates the article exists, then serves in order: (1) local cache (`sendFile`, Range/seek), (2) stream from Object Storage, (3) on-demand OpenAI `tts-1` / `nova` synthesis (streamed, then persisted to both cache + storage) — so fresh deploys serve real narration to everyone (including logged-out readers) without re-spending TTS credits. The player (`public/js/blog-tts.js`) points the Listen button at this endpoint and only falls back to the live API / browser speech if the request fails. Regenerate local MP3s with `node scripts/generate-blog-audio.js --lang en|fr|es` (idempotent; `--force`, `--slug`; uses shared `lib/blogAudioText.js` for HTML→text extraction/chunking — same code the on-demand route uses). Add `--upload` to mirror each freshly generated MP3 into Object Storage as it finishes (key `{lang}/{slug}`), so there's no separate upload step — this is the recommended way to keep storage in sync (it aborts up-front if Object Storage isn't configured, and skipped/already-present files aren't re-uploaded). To backfill storage for MP3s that already exist locally (e.g. generated without `--upload`), use `node scripts/upload-blog-audio.js [--lang en|fr|es] [--slug X] [--force]` (idempotent, skip-if-present).

## First Crossings — Novels & TTS

All 12 chapters use one ElevenLabs voice `dAlhI9qAHVIjXuVppzhW` (both `sofia` and `luca` in `books/voice-map.js` point to it; POV labels are UI-only). To swap voice, change both IDs and restart. YouTube upload tool: `node scripts/upload-to-youtube.js` (uploads, polls, writes a JSON manifest; one-time OAuth in browser, then non-interactive; token at `~/.config/sma-yt/token.json`).

**Chapter audio & durable storage:** Pre-generated chapter MP3s live in `books/audio-cache/{key}.mp3` (e.g. `book4-ch01.mp3`) — **gitignored & ephemeral**, so they're also persisted in Replit Object Storage (`lib/bookAudioStore.js`, stored at `PRIVATE_OBJECT_DIR/book-audio/{key}.mp3`). The `/api/books/tts/:key` route serves in order: (1) local cache (`sendFile`, Range/seek), (2) restore from Object Storage into the local cache, (3) live ElevenLabs synthesis (then persisted to both cache + storage). So fresh deploys never re-synthesize (no wasted credits). Generate with `node scripts/generate-book-audio.js --book bookN` (resumable; `--concurrency`, `--budget`, `--assemble-only`); push to storage with `node scripts/upload-book-audio.js [--book bookN] [--force]` (idempotent).

## Git / Repo Notes

- `.git` is ~2 GB because historical large binaries (mostly `public/audio/` MP3s) were untracked but never purged from history. To reclaim the space, follow `docs/git-history-shrink-runbook.md` — a manual, user-run runbook (history rewrite + force-push; the agent cannot run it).
- `public/audio/blog/` is gitignored — never commit the MP3s.
- `.env.local` is gitignored but still git-tracked by mistake (no secrets inside). To untrack: `git rm --cached .env.local` in the Shell (file stays on disk; this command is blocked for the agent — run it manually).
