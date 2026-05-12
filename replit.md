# ServeMaster Academy

ServeMaster Academy is a professional hospitality training platform offering multi-page marketing, user authentication, a training SPA, Stripe-based subscriptions, and an admin dashboard.

## Run & Operate

**Run:** `node server.js`
**Env Vars:**
- `JWT_SECRET`: JWT signing secret
- `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`: OpenAI API (auto-injected)
- `DATABASE_URL`: PostgreSQL (auto-injected)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Google OAuth
- `STRIPE_PREMIUM_MONTHLY_ID`, `STRIPE_PREMIUM_ANNUAL_ID`, `STRIPE_STARTER_TEAM_ID`, `STRIPE_PRO_TEAM_ID`, `STRIPE_STARTER_TEAM_ANNUAL_ID`, `STRIPE_PRO_TEAM_ANNUAL_ID`: Stripe Price IDs
- `ADMIN_EMAIL`: Email for auto-granted admin access
- `RESEND_API_KEY`: Resend transactional email (auto-injected)
- `APP_URL`: Production application URL (`https://servemasteracademy.ca`)

## Stack

- **Backend:** Express.js (Node.js)
- **Database:** PostgreSQL
- **Auth:** JWT, Google OAuth
- **Payments:** Stripe
- **Email:** Resend
- **Frontend:** Vanilla JS, HTML, CSS (Tailwind CSS)
- **AI:** OpenAI (Whisper for voice transcription)
- **Build Tool:** Tailwind CSS CLI

## Where things live

- `server.js`: Express backend, API routes, auth, AI, Stripe, webhooks.
- `public/`: Marketing pages, blog, static assets.
- `app.html`: Main training Single Page Application (SPA).
- `admin.html`: Admin dashboard.
- `db.js`: PostgreSQL connection.
- `public/js/content.js`: Central content store for modules, lessons, glossary, scenarios, blog.
- **DB Schema:** Refer to `db.js` for table creation and `server.js` for column usage.
- **API Contracts:** Defined within `server.js` routes.
- **Theme/Styling:** `tailwind-input.css` for custom Tailwind overrides, `public/logo.svg`, `public/logo-icon.svg`, `public/logo.png` for branding assets.

## Architecture decisions

- **Centralized Content Store:** `window.SMAContent` (from `public/js/content.js`) acts as a single source of truth for static content across multiple frontend contexts (training SPA, blog).
- **Database-driven Admin Roles:** Admin access is verified via a database role lookup on each request, ensuring immediate permission changes without re-login.
- **Hybrid Content Delivery:** Marketing pages are static HTML, while the training and admin sections are SPAs. Blog content uses a universal template dynamically populated from static HTML files and a content store.
- **White-labeling through CSS Variables:** Enterprise branding is implemented by dynamically injecting CSS custom properties and swapping logos, minimizing changes to core application stylesheets.
- **Multi-channel UTM Tracking:** UTM parameters are robustly captured across different user journeys (marketing site, Google OAuth, team trial requests) using session/local storage and temporary cookies to ensure attribution accuracy.

## Product

- **Interactive Training:** 30 modules, 150 AI roleplay scenarios with voice transcription, quizzes.
- **Gamification:** Streaks, badges, leaderboard.
- **Certifications:** Completion certificates with optional custom restaurant logos.
- **Subscription Management:** Free tier, individual (monthly/annual), and team (monthly/annual) paid plans via Stripe.
- **Manager Dashboard:** Staff invitation, assigned module management, white-label branding for enterprise clients.
- **Referral Program:** Servers can refer managers for a $50 CAD Stripe credit.
- **Multilingual Support:** EN/FR/ES toggle.
- **PWA Capabilities:** Offline support for module text.

## User preferences

- _Populate as you build_

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

## Gotchas

- **Tailwind CSS changes:** Always run `npm run build:css` after modifying `tailwind-input.css`.
- **Admin Access:** To grant admin access, visit `/admin` and click "Grant Admin Access to This Account" or set the `ADMIN_EMAIL` environment variable.
- **Referral Credit:** Referrer's Stripe credit is applied only when they first check out if the referred manager pays before the referrer has a Stripe customer ID.
- **CASL Compliance:** All outbound emails include an unsubscribe link.

## Pointers

- **Stripe Integration:** Refer to Stripe API documentation for `STRIPE_PREMIUM_MONTHLY_ID` and other price IDs.
- **Google OAuth:** Consult Google Cloud Console for `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` setup.
- **Resend API:** See Resend documentation for email sending and `RESEND_API_KEY` usage.
- **PostgreSQL:** Refer to PostgreSQL documentation for database queries and schema management.
- **OpenAI API:** Consult OpenAI documentation for AI integrations and Whisper transcription.
- **Tailwind CSS:** Refer to Tailwind CSS documentation for utility classes and customization.