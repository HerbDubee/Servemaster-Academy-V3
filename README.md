# ServeMaster Academy

Professional hospitality training platform for restaurant servers, bartenders, and managers — live at [servemasteracademy.ca](https://servemasteracademy.ca).

## What it is

ServeMaster Academy is a SaaS training platform purpose-built for the Canadian restaurant industry. It combines structured curriculum (30 modules, 150 scenarios) with AI-powered role-play and voice practice to help front-of-house staff earn more in tips, handle difficult guests, and build lasting careers.

**Brand:** #FF5E3A orange · #0A4D68 teal · Montserrat/Inter · Dark navy backgrounds

---

## Key Features

- **AI Role-Play** — GPT-4o powered guest simulations with structured debriefs (objective, common mistakes, pro tip)
- **Voice Practice** — TTS playback of scenario dialogue; browser-based mic recording
- **30 Curriculum Modules** — Greeting to farewell; upselling, allergens, difficult guests, bar service, and more
- **150 Practice Scenarios** — Served from PostgreSQL; content managed in `public/js/content.js`
- **Manager Dashboard** — Team progress tracking, module assignment, white-label branding, referral program
- **White-Label** — Enterprise clients brand the training app with their logo, name, and colours
- **Affiliate Program** — 25 % year-1 / 10 % lifetime (individual); 30 % / 15 % + $75 activation bonus (team)
- **Stripe Live** — Individual and team subscription tiers; annual discounts; webhook-verified payments
- **Google OAuth + Email Auth** — JWT sessions (30-day); trial period gating; invite-code access
- **i18n** — English, French, Spanish (106 blog articles translated to ES; UI strings via `lang.js`)
- **PWA** — Service worker + manifest; offline-capable
- **Career Launch Scholarship** — `/scholarship` page + application flow
- **CASL-compliant Email** — Resend transactional + drip sequences; one-click unsubscribe tokens

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + Express (port 5000) |
| Database | PostgreSQL (Replit built-in, accessed via `db.js`) |
| AI | OpenAI GPT-4o (chat) + TTS (audio) via Replit integration |
| Payments | Stripe (Live mode) via `stripeClient.js` |
| Email | Resend via Replit integration |
| Auth | JWT (cookie) + Google OAuth 2.0 |
| Frontend | Vanilla JS, HTML, CSS — no build step |
| PWA | `public/sw.js` + `public/manifest.json` |

---

## File Structure

```
server.js              — Express backend: all routes, auth, AI, Stripe, admin, webhooks
app.html               — Training SPA (served at /app, auth-gated)
admin.html             — Owner/admin dashboard (served at /admin, role-gated)
db.js                  — PostgreSQL pool
stripeClient.js        — Stripe connector helpers
public/
  home.html            — Marketing homepage
  pricing.html         — Pricing + plan toggle
  features.html        — Features page
  about.html           — About page
  blog/                — 106 EN articles + index + article template
  blog/es/             — 106 ES translations
  js/
    content.js         — Central content store (modules, scenarios, blog metadata)
    nav-auth.js        — Auth-aware navigation state
    lang.js            — EN/FR/ES UI strings
    pwa-nav.js         — PWA install prompt + navigation
    wl-branding.js     — White-label branding injector
    chat-widget.js     — Support chat widget
  manifest.json        — PWA manifest
  sw.js                — Service worker
  robots.txt           — Disallows /api/ from crawlers
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values. The following are required at minimum:

| Variable | Required | Notes |
|----------|----------|-------|
| `JWT_SECRET` | Yes | Server won't start without it |
| `DATABASE_URL` | Yes | Auto-injected on Replit |
| `APP_URL` | Yes | `https://servemasteracademy.ca` in prod |
| `ADMIN_EMAIL` | Yes | Gets admin role on startup |
| `OPENAI_API_KEY` | Yes | For AI role-play + TTS |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth |
| `STRIPE_SECRET_KEY` + Price IDs | Yes | Live mode |
| `STRIPE_WEBHOOK_SECRET` | Yes | Webhook verification |
| `RESEND_API_KEY` | Yes | Transactional email |

See `.env.example` for the full list.

---

## Subscription Tiers (CAD)

| Plan | Monthly | Annual |
|------|---------|--------|
| Individual | $19/mo | $149/yr |
| Team Starter | $99/mo | $990/yr |
| Team Pro | $199/mo | $1,990/yr |
| Enterprise | Custom | Custom |

---

## Admin Access

Visit `/admin` — if your account email matches `ADMIN_EMAIL`, you are auto-granted admin role on server startup. The admin dashboard is role-checked against the database on every request (not just JWT).
