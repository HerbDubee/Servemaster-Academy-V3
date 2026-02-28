# Building the ServeMaster Academy APK

## How the app works
The APK is a native Android shell that loads your live Replit-hosted app
(https://servemaster-academy.replit.app) inside a native WebView. All AI
features continue to run through the Replit server — the APK itself contains
no API keys or secrets.

**Important:** Your Replit app must be deployed and running for the AI
Practice scenarios to work inside the APK.

---

## Before you build — update your server URL

The server URL is already set to `https://servemaster-academy.replit.app` in
`capacitor.config.json`. No changes needed unless you move to a different domain.

---

## Step 1 — Download the project

In Replit, click the three-dot menu → **Download as ZIP**.
Unzip the file on your computer.

---

## Step 2 — Install Android Studio

Download and install Android Studio from:
https://developer.android.com/studio

During setup, let it install the default Android SDK components.

---

## Step 3 — Open the Android project

1. Open Android Studio
2. Click **Open**
3. Navigate to the unzipped folder and select the **`android`** subfolder
4. Wait for Gradle to sync (this can take a few minutes the first time)

---

## Step 4 — Build a debug APK (for testing)

1. In Android Studio, go to **Build → Build Bundle(s) / APK(s) → Build APK(s)**
2. Wait for the build to complete
3. Click **locate** in the notification that appears
4. Your APK is at: `android/app/build/outputs/apk/debug/app-debug.apk`

Transfer this file to your Android phone and install it
(you may need to enable "Install from unknown sources" in your phone settings).

---

## Step 5 — Build a release APK (for distribution / Play Store)

1. Go to **Build → Generate Signed Bundle / APK**
2. Choose **APK**
3. Create or select a keystore file (keep this safe — you need it for all future updates)
4. Follow the wizard to sign and build
5. Your signed APK will be in: `android/app/build/outputs/apk/release/`

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "AI not connected" in the app | Make sure your Replit deployment is published and running |
| Gradle sync fails | In Android Studio: File → Invalidate Caches → Restart |
| App shows loading screen only | Check that `server.url` in `capacitor.config.json` is your correct deployed URL |
| Install blocked on phone | Enable Settings → Security → Install unknown apps |
