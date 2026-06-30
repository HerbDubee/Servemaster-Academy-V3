#!/usr/bin/env node
/**
 * Pre-generate MP3 audio files for all blog articles.
 *
 * Usage:
 *   node scripts/generate-blog-audio.js            # generate all missing files
 *   node scripts/generate-blog-audio.js --force    # regenerate even if file exists
 *   node scripts/generate-blog-audio.js --lang en  # only one language
 *   node scripts/generate-blog-audio.js --slug handle-complaints  # one article (all langs)
 *   node scripts/generate-blog-audio.js --upload   # also push each new MP3 to Object Storage
 *
 * Output: public/audio/blog/{en|fr|es}/{slug}.mp3
 *
 * Each file is a single MP3 created by chunking the article text into <=4000-char
 * segments, calling OpenAI TTS-1 for each, and binary-concatenating the results.
 * Binary concat is valid for same-bitrate MP3 streams.
 *
 * With --upload, every file that's freshly generated this run is mirrored into
 * durable Replit Object Storage as it finishes (key `{lang}/{slug}`), so a fresh
 * deploy serves the real narration without a separate `upload-blog-audio.js` step.
 * Skipped (already-present) files aren't re-uploaded; use scripts/upload-blog-audio.js
 * to backfill storage for files that already exist locally.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const OpenAI = require('openai');
const {
  TTS_MODEL, TTS_VOICE,
  extractText, preprocessForTTS, splitIntoChunks,
} = require('../lib/blogAudioText');
const blogAudioStore = require('../lib/blogAudioStore');

// ── Config ────────────────────────────────────────────────────────────────────

const BLOG_DIR  = path.join(__dirname, '../public/blog');
const AUDIO_DIR = path.join(__dirname, '../public/audio/blog');
const CONCURRENCY = 20;          // articles processed in parallel
const RATE_DELAY_MS = 0;         // no artificial delay — let concurrency handle throughput

const LANG_DIRS = {
  en: BLOG_DIR,
  fr: path.join(BLOG_DIR, 'fr'),
  es: path.join(BLOG_DIR, 'es'),
};

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const FORCE      = args.includes('--force');
const UPLOAD     = args.includes('--upload');
const LANG_FILTER = (args.indexOf('--lang') !== -1) ? args[args.indexOf('--lang') + 1] : null;
const SLUG_FILTER = (args.indexOf('--slug') !== -1) ? args[args.indexOf('--slug') + 1] : null;

// ── OpenAI client ─────────────────────────────────────────────────────────────

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) {
    console.error('ERROR: No OpenAI API key found. Set OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY.');
    process.exit(1);
  }
  return new OpenAI({ apiKey });
}

// HTML text extraction, TTS pre-processing, and chunking are shared with the
// server's on-demand synthesis fallback — see lib/blogAudioText.js (imported above).

// ── TTS API call ──────────────────────────────────────────────────────────────

async function ttsChunk(openai, text) {
  const response = await openai.audio.speech.create({
    model:           TTS_MODEL,
    voice:           TTS_VOICE,
    input:           text,
    response_format: 'mp3',
  });
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Per-article generation ────────────────────────────────────────────────────

const ARTICLE_TIMEOUT_MS = 180000; // 180s max per article before skipping

async function maybeUpload(key, outputFile, label) {
  if (!UPLOAD) return;
  try {
    await blogAudioStore.upload(key, outputFile);
    console.log(`  PUSH  ${label} → Object Storage`);
  } catch (err) {
    console.error(`  WARN  ${label} upload to storage failed: ${err.message}`);
  }
}

async function generateArticle(openai, htmlFile, outputFile, label, storageKey) {
  // Skip if file already exists and not forcing
  if (!FORCE && fs.existsSync(outputFile) && fs.statSync(outputFile).size > 1024) {
    console.log(`  SKIP  ${label} (already exists)`);
    return 'skipped';
  }

  const html = fs.readFileSync(htmlFile, 'utf8');

  // Skip template / index pages with no real article content
  if (!html.includes('class="prose"') && !html.includes('id="article-body"')) {
    console.log(`  SKIP  ${label} (no prose content)`);
    return 'skipped';
  }

  const rawText = extractText(html);
  if (!rawText || rawText.length < 100) {
    console.log(`  SKIP  ${label} (too short: ${rawText.length} chars)`);
    return 'skipped';
  }

  const text   = preprocessForTTS(rawText);
  const chunks = splitIntoChunks(text);

  console.log(`  GEN   ${label} (${chunks.length} chunk${chunks.length > 1 ? 's' : ''}, ${text.length} chars)`);

  const buffers = [];
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) await sleep(RATE_DELAY_MS);
    try {
      const buf = await ttsChunk(openai, chunks[i]);
      buffers.push(buf);
    } catch (err) {
      console.error(`  ERROR ${label} chunk ${i + 1}/${chunks.length}: ${err.message}`);
      // Retry once after a short pause
      await sleep(2000);
      try {
        const buf = await ttsChunk(openai, chunks[i]);
        buffers.push(buf);
      } catch (err2) {
        console.error(`  FAIL  ${label} chunk ${i + 1}/${chunks.length} (retry failed): ${err2.message}`);
        return 'error';
      }
    }
  }

  const combined = Buffer.concat(buffers);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, combined);
  console.log(`  DONE  ${label} → ${(combined.length / 1024).toFixed(0)} KB`);
  await maybeUpload(storageKey, outputFile, label);
  return 'ok';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const openai = getOpenAI();

  if (UPLOAD && !blogAudioStore.isConfigured()) {
    console.error('ERROR: --upload requested but Object Storage is not configured (PRIVATE_OBJECT_DIR unset).');
    process.exit(1);
  }

  // Build work list: { lang, slug, htmlFile, outputFile }
  const work = [];

  for (const [lang, dir] of Object.entries(LANG_DIRS)) {
    if (LANG_FILTER && lang !== LANG_FILTER) continue;
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.html'))
      .filter(f => f !== 'article.html');  // skip template

    for (const file of files) {
      const slug = file.replace(/\.html$/, '');
      if (SLUG_FILTER && slug !== SLUG_FILTER) continue;
      work.push({
        lang,
        slug,
        htmlFile:   path.join(dir, file),
        outputFile: path.join(AUDIO_DIR, lang, slug + '.mp3'),
        label:      `[${lang}] ${slug}`,
        storageKey: `${lang}/${slug}`,
      });
    }
  }

  if (work.length === 0) {
    console.log('No articles matched the given filters.');
    return;
  }

  console.log(`\nGenerating audio for ${work.length} article(s) (concurrency=${CONCURRENCY}, force=${FORCE})\n`);

  let ok = 0, skipped = 0, errors = 0;
  let i = 0;

  // Wrap each article with a per-article timeout so one slow article
  // doesn't block the whole batch from completing.
  function withTimeout(promise, label) {
    const timer = new Promise(resolve =>
      setTimeout(() => resolve('timeout'), ARTICLE_TIMEOUT_MS)
    );
    return Promise.race([promise, timer]).then(result => {
      if (result === 'timeout') {
        console.log(`  SKIP  ${label} (timed out — re-run to retry)`);
        return 'error';
      }
      return result;
    });
  }

  // Process in batches of CONCURRENCY
  while (i < work.length) {
    const batch = work.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(item =>
        withTimeout(
          generateArticle(openai, item.htmlFile, item.outputFile, item.label, item.storageKey),
          item.label
        )
      )
    );
    for (const r of results) {
      if (r === 'ok')           ok++;
      else if (r === 'skipped') skipped++;
      else                      errors++;
    }
    i += CONCURRENCY;
    // Brief pause between batches to respect rate limits
    if (i < work.length) await sleep(500);
  }

  console.log(`\nDone. Generated: ${ok}  Skipped: ${skipped}  Errors: ${errors}`);
  if (errors > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
