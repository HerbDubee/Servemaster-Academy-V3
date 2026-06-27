---
name: ElevenLabs TTS generation constraints
description: Account/API limits and env behavior when batch-generating ElevenLabs narration MP3s (books, blog audio)
---

# ElevenLabs batch TTS generation

Constraints discovered while generating First Crossings book narration (apply to any
ElevenLabs batch job — book chapters, blog audio):

- **Concurrency cap = 3 parallel requests** on this account's pay-as-you-go tier.
  A 4th concurrent request returns `429 concurrent_limit_exceeded`. Run the worker
  pool at concurrency ≤ 3; add retry-with-backoff for boundary 429s.
  **Why:** ElevenLabs enforces a hard per-subscription parallelism limit; exceeding
  it aborts requests, not queues them.

- **Quota is a hard wall.** When credits run out the API returns
  `401 quota_exceeded` ("0 credits remaining"). Enabling "usage-based billing" in the
  dashboard is what allows overage — selecting it in chat does NOT enable it on the
  account. Always check `GET /v1/user/subscription` (free) for
  `character_limit - character_count` BEFORE a large job and warn if short.
  **Why:** a full novel chapter is ~40k chars; the whole book ~486k chars — easily
  dwarfs a small included quota.

- **Make batch jobs resumable per-chunk.** Cache each synthesized chunk to a part
  file and skip existing parts on re-run; only assemble the final per-chapter MP3
  once all its parts exist. Concatenating MP3 (mp3_44100_128) chunk buffers in order
  is valid — same as the server's streaming TTS route.
  **How to apply:** `scripts/generate-book-audio.js --book bookN --concurrency 3`
  is the resumable generator; re-run it after credits are topped up and it continues
  from saved parts (no wasted credits).

- **Latency:** ~46s per ~4200-char chunk (mp3_44100_128, eleven_multilingual_v2),
  scaling roughly linearly. A full 12-chapter book ≈ 30 min of API time at
  concurrency 3.
