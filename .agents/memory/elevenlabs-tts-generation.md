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

- **Killing a generator mid-request leaves "ghost" connections** that ElevenLabs
  still counts toward the 3-concurrent cap for ~30-60s, so a kill+immediate-relaunch
  loop causes persistent `429 concurrent_limit_exceeded` on the next process.
  **How to apply:** do NOT kill+relaunch to grind. Let each window EXIT CLEANLY via
  the `--budget` flag (it stops launching, lets in-flight finish, assembles, exits 0).
  If you ever must kill stragglers, wait ~40s for ghosts to clear before relaunching,
  and kill by reading /proc/<pid>/cmdline (exclude $$) — never `pkill -f` a pattern
  that also matches your own shell command line (it self-kills → exit 137).

- **Reliable batch recipe in this sandbox:** background/detached node only makes
  progress while a bash call is actively running (it's suspended/killed between
  tool calls, and the bash tool caps at ~120s). Best per-call recipe that produces
  no orphans/ghosts: `nohup node scripts/generate-book-audio.js --book bookN
  --concurrency 2 --budget 50 > log 2>&1 &` then `sleep 100`. concurrency 2 stays
  safely under the 3-cap (no boundary 429s); budget 50 makes node self-exit ~93s;
  ~4 chunks/window; it assembles any chapter completed that window. Repeat until
  `chunks_remaining=0`. `--assemble-only` finishes assembly of fully-cached chapters
  without spending credits.
