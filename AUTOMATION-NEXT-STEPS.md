# Automation Next Steps

Current runtime truth:
- Replit is the primary runtime
- Start command: `node server.js`
- `npm start` is equivalent
- PostgreSQL is expected via Replit
- OpenAI / Stripe / Resend are expected via Replit integrations or secrets

## Completed cleanup
- Repo made private again
- Secrets removed from `.replit`
- `.gitignore` added for `.env` and `node_modules/`
- Base env-driven config constants added to `server.js`:
  - `APP_URL`
  - `SUPPORT_EMAIL`
  - `FROM_EMAIL`
  - `BRAND_NAME`
  - `BRAND_LOGO_URL`

## Highest-value next automation work

### 1) Finish env-driven link refactor in `server.js`
Replace high-impact hardcoded references to `https://servemasteracademy.ca` with `APP_URL` for:
- unsubscribe links
- password reset links
- app/pricing/admin links in emails
- Stripe success/cancel/return URLs
- referral / affiliate links
- sitemap base URL

Also replace hardcoded sender/support values with:
- `FROM_EMAIL`
- `SUPPORT_EMAIL`
- `BRAND_NAME`
- `BRAND_LOGO_URL`

### 2) Frontend generated link cleanup
Priority files:
- `app.html`
- `public/manager-dashboard.html`
- `public/verify.html`
- `public/unsubscribe.html`

Goal:
- avoid hardcoded production links in generated/share/verify flows

### 3) Replit operator checklist
Maintain a single source of truth for:
- required secrets
- webhook endpoint
- OAuth callback URL
- smoke test flow

### 4) Automation/reporting ops
Once runtime is stable, consider adding:
- scheduled content/report generation
- lead triage workflow
- content calendar ops cadence
- verified social reporting loop

## Recommended sequencing
1. Finish `server.js` refactor
2. Smoke test in Replit
3. Patch frontend generated-link files
4. Document operator runbook
5. Add business automation on top

## Important note
Do not put secrets back into `.replit` or tracked repo files.
Use Replit Secrets only.
