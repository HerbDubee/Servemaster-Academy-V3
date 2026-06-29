---
name: Book chapter audio — durable storage
description: Why pre-generated chapter narration MP3s must live in Replit Object Storage, not just the local cache.
---

Pre-generated book-chapter narration MP3s (e.g. `book4-ch01.mp3`) are cached in
`books/audio-cache/`, which is **gitignored and ephemeral** — a fresh deploy starts
with an empty cache. Without durable storage the TTS route would re-synthesize each
chapter via paid ElevenLabs TTS on first play after every deploy.

**Decision:** persist each chapter MP3 in Replit Object Storage and restore on demand.
- Helper: `lib/bookAudioStore.js` (plain CommonJS — the main app is `server.js`, no TS
  build). Objects at `PRIVATE_OBJECT_DIR/book-audio/{key}.mp3`.
- `/api/books/tts/:key` serve order: local cache → restore-from-Object-Storage into
  local cache → live ElevenLabs synthesis (then written to both cache and storage).
- Migrate existing files with `node scripts/upload-book-audio.js` (idempotent).

**Why:** the local cache cannot be the source of truth (gitignored + ephemeral); the
gitignore on the audio exists because the MP3s are huge (~45 MB/chapter, GBs total) and
must never be committed. Object Storage is the durable layer that keeps deploys from
re-spending TTS credits.

**How to apply:** when adding a new book/chapter audio, generate it, then run the upload
script so it lands in Object Storage. Any new audio-serving route should keep the same
three-tier order (local → object storage → synthesize-and-persist-to-both).

**Replit Object Storage note (plain JS):** the App Storage blueprint scaffolds a
TypeScript/React Uppy upload flow that does NOT fit a server-rendered plain-JS app —
skip it. Instead use `@google-cloud/storage` directly with the sidecar external_account
credentials (`token_url`/`credential` at `http://127.0.0.1:1106`). `PRIVATE_OBJECT_DIR`
is `/<bucket>/.private`; split off the leading bucket segment to get bucket + object
prefix.
