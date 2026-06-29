'use strict';

/**
 * Pre-generate chapter narration MP3s for a First Crossings book and cache them
 * in books/audio-cache/{key}.mp3 (the files the /api/books/tts/:key route serves
 * on its fast path).
 *
 * Resumable & crash-safe: every chunk is synthesized to a part file under
 * books/audio-cache/.parts/{key}/{NNN}.mp3 and skipped on re-run, so an
 * interrupted job resumes where it left off. When all of a chapter's parts
 * exist they are concatenated (MP3 frames are directly concatenable, the same
 * way the server streams them) into the final {key}.mp3 and the parts removed.
 *
 * Stops immediately and reports if ElevenLabs returns an error (e.g.
 * quota_exceeded) so credit/billing problems surface promptly.
 *
 * Usage:
 *   node scripts/generate-book-audio.js --book book4
 *   node scripts/generate-book-audio.js --book book4 --budget 70   # stop launching after 70s (for short windows)
 *   node scripts/generate-book-audio.js --book book4 --concurrency 5
 *   node scripts/generate-book-audio.js --book book4 --slug book4-ch01
 *   node scripts/generate-book-audio.js --book book4 --force
 */

const fs = require('fs');
const path = require('path');
const { getAllChapters } = require('../books/voice-map');
const { cleanForTTS, chunkForTTS } = require('../lib/bookCleaner');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const BOOK = arg('book', 'book4');
const FORCE = !!arg('force', false);
const ONLY = arg('slug', null);
const ASSEMBLE_ONLY = !!arg('assemble-only', false); // skip synthesis; just concat any chapter whose parts are all present
const BUDGET = parseInt(arg('budget', '0'), 10) || 0;          // seconds; 0 = unlimited
const CONCURRENCY = parseInt(arg('concurrency', '4'), 10) || 4;
const CACHE_DIR = path.join(__dirname, '..', 'books', 'audio-cache');
const PARTS_DIR = path.join(CACHE_DIR, '.parts');

function ts() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
function log(...m) { console.log(`[${ts()}]`, ...m); }
const pad = (n) => String(n).padStart(3, '0');
const startMs = Date.now();
const elapsed = () => Math.round((Date.now() - startMs) / 1000);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchChunkMp3(voiceId, text, apiKey) {
  const maxAttempts = 6;
  for (let attempt = 1; ; attempt++) {
    const resp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
      }
    );
    if (resp.ok) return Buffer.from(await resp.arrayBuffer());

    const detail = await resp.text().catch(() => '');
    // Transient: concurrency cap (3 parallel max) or 5xx — back off and retry.
    const transient = (resp.status === 429 && /concurrent|rate_limit/i.test(detail)) || resp.status >= 500;
    if (transient && attempt < maxAttempts) {
      await sleep(1500 * attempt + Math.floor(Math.random() * 500));
      continue;
    }
    const err = new Error(`ElevenLabs TTS failed (${resp.status}): ${detail.slice(0, 400)}`);
    err.status = resp.status;
    throw err;
  }
}

function writeAtomic(file, buf) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
}

(async () => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) { console.error('ELEVENLABS_API_KEY is not set'); process.exit(1); }

  let chapters = getAllChapters(BOOK);
  if (!chapters.length) { console.error(`No chapters for book "${BOOK}"`); process.exit(1); }
  if (ONLY) chapters = chapters.filter(c => c.key === ONLY);

  fs.mkdirSync(PARTS_DIR, { recursive: true });

  // Build the flat task list of missing chunk parts across all chapters.
  const tasks = [];
  const chapterChunkCount = {};
  for (const ch of chapters) {
    const finalPath = path.join(CACHE_DIR, `${ch.key}.mp3`);
    if (fs.existsSync(finalPath) && !FORCE) { chapterChunkCount[ch.key] = null; continue; }
    const mdPath = path.join(__dirname, '..', 'books', ch.file);
    if (!fs.existsSync(mdPath)) { log(`WARN ${ch.key}: missing ${ch.file}`); continue; }
    const chunks = chunkForTTS(cleanForTTS(fs.readFileSync(mdPath, 'utf8')));
    chapterChunkCount[ch.key] = chunks.length;
    const chDir = path.join(PARTS_DIR, ch.key);
    fs.mkdirSync(chDir, { recursive: true });
    chunks.forEach((text, i) => {
      const partPath = path.join(chDir, `${pad(i)}.mp3`);
      if (fs.existsSync(partPath) && !FORCE) return;
      tasks.push({ key: ch.key, voiceId: ch.voiceId, voiceName: ch.voiceName, i, total: chunks.length, text, partPath });
    });
  }

  log(`Book "${BOOK}": ${tasks.length} chunk(s) to synthesize | concurrency=${CONCURRENCY} | budget=${BUDGET || '∞'}s`);

  // Bounded-concurrency worker pool with a wall-clock launch budget.
  let next = 0, active = 0, completed = 0, charsSpent = 0, aborted = null, budgetHit = false;
  if (ASSEMBLE_ONLY) log('assemble-only mode: skipping synthesis, concatenating complete chapters');
  if (!ASSEMBLE_ONLY) await new Promise((resolve) => {
    const pump = () => {
      if (aborted) { if (active === 0) resolve(); return; }
      if (BUDGET && elapsed() >= BUDGET) budgetHit = true;
      while (!budgetHit && active < CONCURRENCY && next < tasks.length) {
        const t = tasks[next++];
        active++;
        fetchChunkMp3(t.voiceId, t.text, apiKey)
          .then((buf) => {
            writeAtomic(t.partPath, buf);
            completed++; charsSpent += t.text.length;
            log(`ok ${t.key} chunk ${t.i + 1}/${t.total} (${t.text.length} chars, ${buf.length} b) [${completed}/${tasks.length}]`);
          })
          .catch((e) => { if (!aborted) aborted = e; })
          .finally(() => { active--; pump(); });
      }
      if (active === 0 && (next >= tasks.length || budgetHit)) resolve();
    };
    pump();
  });

  if (aborted) throw aborted;

  // Assemble any chapter whose parts are all present.
  let assembled = 0;
  for (const ch of chapters) {
    const count = chapterChunkCount[ch.key];
    if (count == null) continue; // already final, or skipped
    const chDir = path.join(PARTS_DIR, ch.key);
    const parts = [];
    let allThere = true;
    for (let i = 0; i < count; i++) {
      const p = path.join(chDir, `${pad(i)}.mp3`);
      if (!fs.existsSync(p)) { allThere = false; break; }
      parts.push(p);
    }
    if (!allThere) continue;
    const buf = Buffer.concat(parts.map(p => fs.readFileSync(p)));
    writeAtomic(path.join(CACHE_DIR, `${ch.key}.mp3`), buf);
    fs.rmSync(chDir, { recursive: true, force: true });
    assembled++;
    log(`ASSEMBLED ${ch.key}.mp3 (${count} chunks, ${buf.length} bytes)`);
  }

  const remaining = tasks.length - completed;
  log(`DONE batch. chunks_done=${completed} chapters_assembled=${assembled} chunks_remaining=${remaining} chars_spent~=${charsSpent} elapsed=${elapsed()}s`);
  if (remaining > 0 || budgetHit) log(`Resumable: re-run the same command to continue (${remaining} chunk(s) left).`);
})().catch((e) => {
  console.error(`\n[${ts()}] ABORTED: ${e.message}`);
  if (e.status === 401 || /quota|credit|limit|unauthor/i.test(e.message)) {
    console.error('>>> ElevenLabs quota/billing problem. Enable usage-based billing or add credits, then re-run (completed chunks are kept and skipped).');
  }
  process.exit(1);
});
