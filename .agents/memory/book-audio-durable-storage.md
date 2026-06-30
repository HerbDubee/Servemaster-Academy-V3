---
name: Book audio durable serving
description: How chapter MP3 narration is served durably in production, and why download-to-local-disk failed.
---

# Serving book/chapter audio durably

**Rule:** Serve large media (chapter MP3s) by **streaming directly from Replit Object Storage with HTTP Range support** — never download-to-local-disk-then-sendFile.

**Why:** A prior implementation downloaded the full ~45MB MP3 from Object Storage into the gitignored local cache (`books/audio-cache/`) then `res.sendFile()`. In the deployed app this produced intermittent `200/206/500` and **0-byte** responses (confirmed via curl against prod). Deployments run multiple/ephemeral instances; concurrent Range requests from the `<audio>` element raced on the shared cache path during download+rename, and per-instance disk writes are unreliable. HTML5 `<audio>` needs consistent `206`/Range to play and seek, so playback broke.

**How to apply:** The Range-aware streaming + GCS sidecar logic now lives once in `lib/audioObjectStore.js#createAudioStore({prefix, logLabel})`; `bookAudioStore` (prefix `book-audio`) and `blogAudioStore` (prefix `blog-audio`, keys `{lang}/{slug}`) are thin wrappers. `streamToResponse(key, req, res)` parses the `Range` header, uses GCS `file.createReadStream({start,end})` + `getMetadata()` for size, sets `Accept-Ranges`/`Content-Range`/`Content-Length`, and returns 206/200/416/HEAD correctly. Malformed/multi-range headers are ignored (serve full 200). On client disconnect (`res 'close'`) it destroys the GCS stream to stop wasted reads. Both `/api/books/tts/:key` and the public `/api/blog/tts/:lang/:slug` use the same order: local-cache `sendFile` → `streamToResponse` (durable) → live synth (then uploads result to OS). Falls through to synth only if storage is unconfigured/object-missing or `streamToResponse` throws *before* headers are sent.

**Blog audio quirk:** the blog route is **public (no auth)** on purpose — anonymous readers are the common case; the old static-file HEAD-check fell back to the auth-gated `/api/tts`, dropping logged-out users to browser speech. Blog on-demand synth uses OpenAI `tts-1`/`nova` and shares HTML→text extraction/chunking with the offline generator via `lib/blogAudioText.js`.

**Audio inventory caveat:** Only book4 (12/12) has audio in Object Storage. book1 has 2/12, book2 0/12, book3 0/12. Books without OS audio fall to live synth which takes minutes per chapter (effectively "not playing"). Generating them is a large ElevenLabs spend — see elevenlabs-tts-generation.md and get user approval first.
