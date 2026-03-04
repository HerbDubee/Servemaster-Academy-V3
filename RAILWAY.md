# Deploying to Railway

## One-time setup

### 1. Add a PostgreSQL database
In your Railway project → **+ New** → **Database** → **PostgreSQL**.
Railway will auto-populate `DATABASE_URL` into your service.

### 2. Set environment variables
Go to your service → **Variables** tab and add:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | A long random string (generate with `openssl rand -hex 32`) |
| `OPENAI_API_KEY` | Your OpenAI API key (for AI roleplay + Whisper voice) |
| `STRIPE_SECRET_KEY` | From Stripe Dashboard → Developers → API keys |
| `STRIPE_PUBLISHABLE_KEY` | From Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | From Stripe Dashboard after registering the webhook (step 3) |
| `STRIPE_PREMIUM_MONTHLY_ID` | `price_1T6zoHExNgORioBpkHFfppKN` |
| `STRIPE_PREMIUM_ANNUAL_ID` | `price_1T6zmiExNgORioBp78rqoHQF` |
| `STRIPE_STARTER_TEAM_ID` | `price_1T6zlYExNgORioBp06MwjAnO` |
| `STRIPE_PRO_TEAM_ID` | `price_1T700zExNgORioBp0eD0BZo1` |
| `APP_URL` | Your Railway public domain, e.g. `https://servemaster.up.railway.app` |
| `ADMIN_EMAIL` | `herb.dubee@gmail.com` |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console (optional — for Google OAuth) |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console (optional — for Google OAuth) |
| `SMTP_HOST` | e.g. `mail.privateemail.com` (optional — for enterprise inquiry emails) |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | Your SMTP username |
| `SMTP_PASS` | Your SMTP password |

### 3. Register the Stripe webhook manually
Unlike Replit, Railway doesn't auto-register Stripe webhooks.

1. Go to [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **+ Add endpoint**
3. URL: `https://your-railway-domain.up.railway.app/api/stripe/webhook`
4. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. After saving, click **Reveal signing secret** and copy it into `STRIPE_WEBHOOK_SECRET`

### 4. Run the database migrations
On first deploy, the app will connect to PostgreSQL via `DATABASE_URL`.
The schema tables are created automatically on startup.

### 5. Set your custom domain (optional)
Railway project → **Settings** → **Domains** → **+ Custom Domain**.
Point your DNS CNAME to the Railway-provided domain.
Update `APP_URL` to match.

## Notes
- `stripe-replit-sync` is only active when `REPLIT_DOMAINS` is set — it is skipped automatically on Railway.
- The `/health` endpoint returns `{"status":"ok"}` and is used by Railway's healthcheck.
