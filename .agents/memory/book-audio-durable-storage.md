---
name: Book audio durable serving
description: How chapter MP3 narration is served durably in production, and why download-to-local-disk failed.
---

# Serving book/chapter audio durably

**Rule (CURRENT):** Serve large media (chapter/article MP3s) from Object Storage by **302-redirecting the client to a short-lived signed GCS URL** — do NOT stream the bytes through the Express app, and do NOT download-to-local-disk-then-sendFile.

**Why streaming through the app fails:** the deployment is **autoscale (Cloud Run)**. The Cloud Run/"Google Frontend" proxy **500s any large response streamed through the app** (~45MB MP3). Confirmed via curl against prod: a *bounded* Range (`bytes=0-1000`) returned `206` fine, but `HEAD`, open-ended `bytes=0-`, and full `GET` all returned `500` from "Google Frontend" (no app/CSP headers — it never reached our code). The HTML5 `<audio>` element opens playback with exactly those (`HEAD` / `bytes=0-`), so audio never started in prod even though dev (single instance, no proxy) worked. An even earlier download-to-local-disk-then-`sendFile` approach failed differently (0-byte / raced 200/206/500 across ephemeral instances). Both lessons point the same way: **don't move big media through the app on autoscale.**

**The signed-URL fix:** `lib/audioObjectStore.js#createAudioStore` exposes `signedUrl(key, ttlSec=3600)` → checks `isConfigured()` → `exists()` → mints a signed GET URL via the Replit sidecar (`POST /object-storage/signed-object-url`); returns `null` if unconfigured/missing (so the route falls through to synth), throws only on an unexpected sign failure. Both `/api/books/tts/:key` and the public `/api/blog/tts/:lang/:slug` route order is now: local-cache `sendFile` (fast path, same-origin) → `signedUrl` then `res.redirect(302, url)` (durable) → live synth. TTL = 6h covers long listens/seeking; one signed URL serves all subsequent Range requests, and bytes flow browser↔GCS directly with native Range/206. `storage.googleapis.com` is the signed-URL host.

**CSP gotcha (required alongside the redirect):** the `<audio>` element loads cross-origin media after the redirect, so CSP must allow it — `mediaSrc: ["'self'", 'https://storage.googleapis.com']` in the helmet config (server.js). Without `media-src`, `default-src 'self'` silently blocks playback in real browsers (curl does NOT enforce CSP, so curl tests passing is not proof — always check the browser console for CSP violations).

**`streamToResponse` status:** still implemented in the factory (Range-aware GCS streaming, 206/200/416/HEAD, client-disconnect cleanup) but **no longer used by the book or blog routes** — kept only as a reusable utility. If you ever wire it back into a request path on autoscale, you'll reintroduce the proxy-500 bug for large files.

**Blog audio quirk:** the blog route is **public (no auth)** on purpose — anonymous readers are the common case; the old static-file HEAD-check fell back to the auth-gated `/api/tts`, dropping logged-out users to browser speech. Blog on-demand synth uses OpenAI `tts-1`/`nova` and shares HTML→text extraction/chunking with the offline generator via `lib/blogAudioText.js`.

**Audio inventory caveat:** Only book4 (12/12) has audio in Object Storage. book1 has 2/12, book2 0/12, book3 0/12. Books without OS audio fall to live synth which takes minutes per chapter (effectively "not playing"). Generating them is a large ElevenLabs spend — see elevenlabs-tts-generation.md and get user approval first.
