# ServeMaster Academy

A professional hospitality training web app for restaurant servers, with full auth, gamification, bilingual support, and manager tools.

## Architecture

- `index.html` — Full single-page application (all screens, logic, i18n)
- `server.js` — Express backend (port 5000); auth, progress sync, OpenAI roleplay, manager API
- `db.js` — PostgreSQL connection pool (Replit built-in Neon database)
- `www/` — Minimal placeholder used as Capacitor webDir for Android builds
- `android/` — Capacitor Android project (open in Android Studio to build APK)
- `capacitor.config.json` — Capacitor config; update `server.url` before building APK
- `BUILD_APK.md` — Step-by-step instructions for building the Android APK

## Features

### Core Training
- 12 learning modules with expandable lessons, FR/EN translations, and quizzes
- Progress tracking synced to PostgreSQL when logged in, localStorage fallback
- 3-step onboarding (name + experience level)

### User Accounts
- Email + password registration and login
- Google OAuth login (requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET env vars)
- JWT token auth (30-day sessions via httpOnly cookies + localStorage)
- Cross-device progress sync via PostgreSQL

### AI Practice
- 30 role-play scenarios (IDs 1-30) covering all hospitality situations
- Full voice input: microphone button uses Web Speech API SpeechRecognition
- AI voice output: SpeechSynthesis reads guest responses aloud (toggleable)
- Per-turn coaching feedback from AI guest

### Gamification
- Daily login streaks (tracked in DB + localStorage fallback)
- 12 badges with unlock logic (first module, scenario ace, wine expert, etc.)
- Toast notifications when badges are earned
- Leaderboard page (top 20 users by total progress)

### Completion Certificate
- Beautiful PDF certificate generated client-side via jsPDF
- Triggered when all 12 modules reach 100% progress
- Bilingual (EN/FR): certificate language matches app language

### Email Newsletter
- Email capture modal (shown after first module completion)
- Stores in email_subscribers table
- Accessible from nav user menu and dashboard

### Restaurant Manager Dashboard
- Create a restaurant profile (generates invite code)
- Staff join via invite link/code
- View all staff: modules completed, avg score, scenarios, streak, last active
- Export staff progress as CSV
- Invite link copy button

### Tray Balance Simulator
- DeviceOrientation API (gyroscope) on mobile — tilt device to move glasses
- Mouse-based tilt on desktop — move mouse over tray
- 5 glasses, physics-based sliding, time score

### French Language Version
- Full EN/FR toggle in nav (🇬🇧 / 🇫🇷)
- All UI strings, module titles, lesson content, scenario descriptions translated
- Voice recognition switches to fr-FR in French mode
- Persisted in localStorage

## Key Environment Variables

- `AI_INTEGRATIONS_OPENAI_API_KEY` — Replit OpenAI integration (auto-injected)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — Replit OpenAI integration (auto-injected)
- `DATABASE_URL` — Replit built-in PostgreSQL (auto-injected)
- `JWT_SECRET` — Secret for JWT signing (defaults to hardcoded value; set in secrets for production)
- `GOOGLE_CLIENT_ID` — Google OAuth app client ID (optional; Google login disabled if not set)
- `GOOGLE_CLIENT_SECRET` — Google OAuth app client secret (optional)

## Database Schema

- `users` — Accounts (email/password + Google OAuth)
- `user_progress` — Module progress + quiz scores per user
- `streaks` — Daily login streak tracking
- `badges` — Earned badge records
- `scenario_scores` — Completed role-play session records
- `restaurants` — Manager restaurant profiles + invite codes
- `email_subscribers` — Newsletter signups

## Deployment

- Autoscale deployment: `node server.js`
- Android APK: update `server.url` in `capacitor.config.json`, then `npx cap sync android`
