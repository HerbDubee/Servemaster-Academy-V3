# ServeMaster Academy

A professional hospitality training web app for restaurant servers.

## Architecture

- `index.html` — Full single-page app with all 12 training modules, quizzes, progress tracking, onboarding flow, and Practice tab
- `server.js` — Express backend (port 5000); handles OpenAI API calls securely via Replit AI Integration
- `www/` — Minimal placeholder page used as Capacitor webDir for Android builds
- `android/` — Capacitor Android project (open in Android Studio to build APK)
- `capacitor.config.json` — Capacitor configuration; update `server.url` to your deployed URL before building APK
- `BUILD_APK.md` — Step-by-step instructions for building the Android APK

## Features

- 12 learning modules with expandable lessons and quizzes
- Progress tracking via localStorage
- 3-step onboarding (name + experience level)
- AI-powered Practice tab with 10 role-play scenarios using gpt-4o-mini
- Per-turn coaching feedback from the AI guest

## Key Details

- OpenAI integration uses Replit AI Integrations (no user API key needed)
- Model: `gpt-4o-mini`
- Deployment: autoscale (node server.js)
- Android APK loads the live deployed URL — AI features require the Replit server to be running

## Android Build

Before building the APK, update `server.url` in `capacitor.config.json` to the actual deployed Replit URL, then run `npx cap sync android`. See `BUILD_APK.md` for full instructions.
