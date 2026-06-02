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

## Manager Dashboard

The manager dashboard (`public/manager-dashboard.html`) is one of the most feature-rich parts of the platform. It is a sidebar SPA served at `/manager-dashboard` (also reachable via the training app) and is separate from `admin.html`.

### Account & restaurant creation

A user becomes a manager by creating a restaurant tenant:

```
POST /api/manager/create-restaurant  { restaurantName }
```

This inserts a row into `restaurants` (generating a random 8-char `invite_code`), then promotes the calling user's `role` to `'manager'` and sets their `restaurant_id`. Existing users can join a restaurant via:

```
POST /api/manager/join  { inviteCode }
```

This sets `restaurant_id` on the joining user without changing their role — useful for co-managers.

### Permission model

All manager-only routes are gated behind `managerMiddleware` (defined in `server.js`). It checks that the caller's DB row has `role = 'manager'` OR `role = 'admin'`. Roles are re-read from the database on every request — there is no role caching in the JWT, so demoting a manager takes effect immediately without a re-login.

### Dashboard overview

```
GET /api/manager/dashboard
```

Returns the `restaurants` row for the manager's tenant plus an aggregated `staff` array (modules_completed, avg_score, scenarios_done, current_streak per user).

```
GET /api/team
```

Returns a richer team list (avg_progress, avg_quiz_score, scenarios, badges, strongest module, status) used by the Team Overview tab. Supports 100-member pages. Site-wide admins without a `restaurant_id` see all non-manager users.

### Staff drill-down

```
GET /api/manager/staff/:id
```

Returns full detail for one staff member: their progress on each of the 30 modules, scenario completions, badges earned, and the last 10 scenario transcripts. The frontend renders this in a slide-over modal with progress bars, a module grid, and a badge list.

### Staff actions

- **Send nudge:** `POST /api/manager/nudge { userId }` — sends a branded Resend email encouraging the staff member to continue training. The email body uses the restaurant's white-label branding (name, logo, colours) if enabled.
- **Issue certificate:** `POST /api/certificate { userId }` — marks all 30 modules as 100% complete for that user and logs an entry to the `certificates` table. Gated by `managerMiddleware`.
- **Certificate history:** `GET /api/manager/certificates` — returns all certificates issued by the calling manager, joined with staff name/email and the issuer's name.

### Assigned (required) modules

Managers can flag certain modules as required for their whole team. Staff see a "Required" badge on those modules in the training SPA.

```
GET    /api/manager/assigned-modules         → { modules: [1, 4, 7, …] }
POST   /api/manager/assign     { moduleId }  → adds to assigned_modules table
DELETE /api/manager/assign/:moduleId         → removes from assigned_modules table
GET    /api/user/assigned-modules            → used by training SPA (reads via restaurant_members)
```

DB table: `assigned_modules (restaurant_id, module_id)` with a unique constraint.

### Training plans

Per-staff ordered training plans with optional per-item due dates.

```
POST   /api/manager/training-plans                      { userId, title }    → creates plan
GET    /api/manager/training-plans                                            → all plans with items + live progress
POST   /api/manager/training-plans/:planId/items        { moduleId, dueDate, position }
DELETE /api/manager/training-plans/:planId/items/:itemId
DELETE /api/manager/training-plans/:planId

GET    /api/user/training-plan   → staff member's own most-recent plan with items + progress (used in app.html)
```

DB tables: `training_plans (restaurant_id, user_id, title, created_by)` and `training_plan_items (plan_id, module_id, position, due_date)`. Items are returned with live `progress` and `quiz_score` joined from `user_progress`.

### Skill-gap report

```
GET /api/manager/skill-gap
```

Returns per-module averages across the whole team (avg progress, avg quiz score, number of staff who started each module). The frontend uses this to render a "weakest modules" chart and a per-module heat-map bar in the Reports tab.

### Progress export

The Export button in the header triggers either:

- **CSV:** `GET /api/manager/export/csv` — generates a UTF-8 CSV (name, email, avg_progress, modules_completed, avg_quiz_score, scenarios, badges, last_login) and streams it as a file download.
- **PDF:** `GET /api/manager/export/pdf` — renders an HTML table server-side and converts to PDF using `html-pdf` (or similar). Returned as a binary stream.

Both routes are protected by `managerMiddleware`.

### White-label branding (Enterprise)

Enterprise tenants can rebrand the training app with their own name, logo, and colour scheme. The branding panel in the Settings tab is hidden for non-enterprise managers (the `wl-section` div starts as `display:none` and is revealed by JS only if the server confirms enterprise status).

```
GET  /api/manager/white-label          → current config
POST /api/manager/white-label          { brandName, logoUrl, primaryColor, accentColor, isActive }
```

Stored as five columns on the `restaurants` table:

| Column | Type | Notes |
|---|---|---|
| `wl_brand_name` | text | Falls back to `restaurants.name` if blank |
| `wl_logo_url` | text | Must start with `https://` |
| `wl_primary_color` | text | Validated as `#rrggbb`; applied as `--color-primary` CSS variable |
| `wl_accent_color` | text | Validated as `#rrggbb`; applied as `--color-accent` CSS variable |
| `wl_is_active` | boolean | Master switch; branding is ignored while `false` |

When a staff member logs in via an invite link the training SPA calls:

```
GET /api/tenant/branding/invite?code=XXXX    → { branding: { isActive, brandName, logoUrl, primaryColor, accentColor } | null }
GET /api/tenant/branding                     → same, resolved from the logged-in user's restaurant_id
```

The SPA injects the returned colours as CSS custom properties on `<html>` and swaps the logo `<img>` src, so the entire UI reflects the brand without any CSS file changes.

Nudge and digest emails also consume the branding via the internal `getTenantBrandingForEmail(managerId)` helper — branded `from` name, logo in the email header, and "Powered by ServeMaster" footer toggled off for enterprise accounts.

### Weekly email digest

```
GET /api/manager/digest-preference         → { enabled: true|false }
PUT /api/manager/digest-preference         { enabled: boolean }
```

Stored as `weekly_digest_enabled` on the `users` table (defaults to `true`). When enabled, managers receive a Monday-morning Resend email summarising team progress for the prior week. Toggle is rendered as a styled checkbox in the Settings tab.

### Training deadline

```
GET  /api/manager/deadline         → { deadline: "2025-12-31" | null }
POST /api/manager/deadline         { deadline: "YYYY-MM-DD" | null }
```

Stored as `training_deadline` on `restaurants`. Displayed as an urgency reminder in the dashboard header when set. Staff do not see this deadline; it is manager-only.

### Certificate logo

Managers can add their restaurant's logo URL to completion certificates:

```
GET  /api/manager/cert-logo        → { logoUrl: "…" | null }
POST /api/manager/cert-logo        { logoUrl }
```

The URL is stored in `restaurants.cert_logo_url` and rendered on the certificate PDF/HTML alongside the ServeMaster Academy branding.

### Invite link

The Settings tab displays a full shareable URL:

```
https://servemasteracademy.ca/join?code=XXXXXXXX
```

When a staff member visits this URL they are prompted to create an account (or log in), and their `restaurant_id` is set automatically via the join flow.

### DB tables summary

| Table | Purpose |
|---|---|
| `restaurants` | One row per tenant. Holds `invite_code`, `training_deadline`, `cert_logo_url`, and all `wl_*` branding columns. |
| `users` | `role` (`'server'`, `'manager'`, `'admin'`), `restaurant_id`, `weekly_digest_enabled` |
| `assigned_modules` | `(restaurant_id, module_id)` — required modules per tenant |
| `training_plans` | Per-staff plan header (`restaurant_id`, `user_id`, `title`, `created_by`) |
| `training_plan_items` | `(plan_id, module_id, position, due_date)` |
| `certificates` | Log of every certificate issued (`user_id`, `issued_by`, `issued_at`) |

---

## First Crossings — Novels & TTS

- **Single narrator:** All 12 chapters use one ElevenLabs voice — `dAlhI9qAHVIjXuVppzhW`. Both `sofia` and `luca` entries in `books/voice-map.js` point to this ID. The POV labels (Sofia / Luca) are kept for UI display only.
- **Voice source:** https://elevenlabs.io/app/voice-lab/share/c4cfee2ad0d3d272176a36b773ddbf8df48c457a5aa7664dd8523f6dcdfbb76b/dAlhI9qAHVIjXuVppzhW
- **To swap voice:** change both `sofia.id` and `luca.id` in `books/voice-map.js` and restart the server.
- **YouTube upload tool:** `node scripts/upload-to-youtube.js` — uploads video, polls processing, writes JSON manifest to `/data/.openclaw/workspace/shared-memory/youtube-uploads/`. Run once for OAuth (browser prompt), then non-interactive. Token stored at `~/.config/sma-yt/token.json`.

## Blog article freshness convention

Each entry in the `blogArticles` array in `public/js/content.js` has two date fields:

- `datePublished` — the original publication date; never changes.
- `dateModified` — must be updated (to today's date in `YYYY-MM-DD` format) **every time the corresponding HTML file in `public/blog/` is meaningfully revised** (new content, corrected facts, updated references, restructured sections). Minor typo fixes do not require a bump.

**Why this matters:** Google uses `dateModified` in the JSON-LD schema on every article page to detect freshness. A stale value signals old content; a missing bump after a real revision means fresh content goes undetected.

**Checking for drift:** Run the freshness-check utility at any time to find articles whose HTML file has been committed more recently than their declared date:

```
node scripts/check-blog-freshness.js
```

It compares each article's declared date against the last `git log` commit date for its HTML file (stable across clones and CI — unlike filesystem mtime). It lists every article that needs a `dateModified` bump and exits with a non-zero code if any are found. Run it after any blog editing session.

**Auto-fixing stale dates:** Instead of editing `content.js` by hand, run the companion fix script to update every stale `dateModified` in one command:

```
node scripts/fix-blog-freshness.js
```

It reads the same stale list as the check script and sets each article's `dateModified` to its last git-commit date. After running, verify with `node scripts/check-blog-freshness.js` (should exit 0 with no stale articles).

## Blog Post Categories & OG Images

Every blog post in `public/blog/` must include a `<meta name="blog-category">` tag in its `<head>`. This drives the correct OG social-share image automatically — no manual map needed.

**Available categories and their OG images:**

| `content` value | OG image file | Use for |
|---|---|---|
| `server-skills` | `og-server-skills.png` | Front-of-house serving techniques, guest interaction, upselling, table management |
| `bartending` | `og-bartending.png` | Bar craft, cocktails, spirits, bartending techniques and operations |
| `management` | `og-management.png` | Leadership, hiring, scheduling, training, industry trends, career development |

**Required tag format** (place after the `og:image:height` meta tag):
```html
<meta name="blog-category" content="server-skills">
```

When in doubt: if the post is about behind-the-bar craft → `bartending`; if it's about running a team or venue → `management`; everything else front-of-house → `server-skills`.

## Blog audio files (pre-generated MP3s)

Blog articles support a "Listen" button powered by pre-generated MP3 files served as static assets.

**Location on disk (not in git):** `public/audio/blog/{lang}/{slug}.mp3`

This directory is in `.gitignore` — the ~1.9 GB of MP3 files must never be committed to the repository. Regenerate them locally whenever needed:

```
node scripts/generate-blog-audio.js --lang en
node scripts/generate-blog-audio.js --lang fr
node scripts/generate-blog-audio.js --lang es
```

The script is idempotent: it skips slugs where the MP3 already exists. Use `--force` to regenerate, `--slug article-slug` to regenerate a single article. It uses the OpenAI `tts-1` model with the `nova` voice (concurrency=20, 180 s per-article timeout).

**Runtime fallback:** `public/js/blog-tts.js` performs a HEAD request to check whether the static file exists. If the HEAD returns 200 it streams the MP3; if 404 it falls back to a live OpenAI TTS chunked stream call, so the Listen button always works even without pre-generated files.

## Git history note — audio commit cleanup

The commit `6cdb849` (Pre-generate MP3 audio for all blog articles) added ~1.9 GB of MP3s to local git history but has **not been pushed to GitHub**. Before pushing to `origin`, remove it from history by running the following commands in the Replit shell:

```bash
# Un-commit the audio commit and the empty checkpoint above it,
# keeping all non-audio changes staged
git reset --soft HEAD~2

# Unstage the audio directory (files stay on disk)
git restore --staged public/audio/

# Re-stage the scripts and any other changes from that commit
git add scripts/generate-blog-audio.js public/js/blog-tts.js .gitignore replit.md

# Re-commit cleanly (no audio files)
git commit -m "Add blog audio pre-generation script and .gitignore for generated assets"
```

After this the local history will be clean and a normal `git push origin main` will work without bloating GitHub.

## Gotchas

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

- **Stripe Integration:** Refer to Stripe API documentation for `STRIPE_PREMIUM_MONTHLY_ID` and other price IDs.
- **Google OAuth:** Consult Google Cloud Console for `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` setup.
- **Resend API:** See Resend documentation for email sending and `RESEND_API_KEY` usage.
- **PostgreSQL:** Refer to PostgreSQL documentation for database queries and schema management.
- **OpenAI API:** Consult OpenAI documentation for AI integrations and Whisper transcription.
- **Tailwind CSS:** Refer to Tailwind CSS documentation for utility classes and customization.
