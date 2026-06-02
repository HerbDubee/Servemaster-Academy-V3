#!/usr/bin/env node
/**
 * Pre-generate MP3 audio files for all blog articles.
 *
 * Usage:
 *   node scripts/generate-blog-audio.js            # generate all missing files
 *   node scripts/generate-blog-audio.js --force    # regenerate even if file exists
 *   node scripts/generate-blog-audio.js --lang en  # only one language
 *   node scripts/generate-blog-audio.js --slug handle-complaints  # one article (all langs)
 *
 * Output: public/audio/blog/{en|fr|es}/{slug}.mp3
 *
 * Each file is a single MP3 created by chunking the article text into <=4000-char
 * segments, calling OpenAI TTS-1 for each, and binary-concatenating the results.
 * Binary concat is valid for same-bitrate MP3 streams.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const OpenAI = require('openai');

// ── Config ────────────────────────────────────────────────────────────────────

const BLOG_DIR  = path.join(__dirname, '../public/blog');
const AUDIO_DIR = path.join(__dirname, '../public/audio/blog');
const TTS_MODEL = 'tts-1';
const TTS_VOICE = 'nova';
const CHUNK_MAX = 3900;          // chars per TTS call (server limit is 4000; leave headroom)
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

// ── HTML text extraction ──────────────────────────────────────────────────────

function decodeEntities(str) {
  return str
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8212;/g, ' — ')
    .replace(/&#8211;/g, ' – ')
    .replace(/&hellip;/g, '...')
    .replace(/&#\d+;/g, ' ')
    .replace(/&[a-z]+;/g, ' ');
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function extractText(html) {
  const parts = [];

  // 1. H1 title (outside prose — usually in the page header)
  const h1m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1m) {
    const t = stripTags(h1m[1]);
    if (t.length > 3) parts.push(t);
  }

  // 2. Locate the .prose div
  const proseIdx = html.indexOf('class="prose"');
  if (proseIdx === -1) return parts.join('. ');

  // Take a generous slice starting from the prose div (up to ~40 KB)
  const proseStart = html.lastIndexOf('<div', proseIdx);
  const proseArea  = html.slice(proseStart, proseStart + 40000);

  // Extract text-bearing elements in document order
  const tagRe = /<(h[2-6]|p|li|blockquote|strong)([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = tagRe.exec(proseArea)) !== null) {
    // Skip data-i18n elements (UI labels, not article text)
    if (/data-i18n/.test(m[2])) continue;
    const text = stripTags(m[3]);
    // Filter: must be substantial prose, not a nav link or CTA button
    if (text.length < 15) continue;
    // Skip if it's just a URL or a call-to-action link text
    if (/^(Get Started|Sign Up|Start Free|Learn More|Read More|Free Trial)$/i.test(text)) continue;
    parts.push(text);
  }

  return parts.join(' ');
}

// ── Preprocessing (mirrors blog-tts.js for consistent output) ─────────────────

function preprocessForTTS(text) {
  text = text.replace(/\b(have|has|had)\s+read\b/gi, '$1 red');
  text = text.replace(/([''`]ve)\s+read\b/gi,         '$1 red');
  text = text.replace(/\bget\s+read\b/gi,             'get noticed');
  text = text.replace(/\bread\b/g,                    'reed');
  text = text.replace(/\btear\s+up\b/gi,              'well up with tears');
  text = text.replace(/\bclose\s+to\b/gi,             'near to');
  text = text.replace(/\bis\s+close\b(?!\s+to)/gi,    'is nearby');
  return text;
}

// ── Chunking ──────────────────────────────────────────────────────────────────

function splitIntoChunks(text, maxLen) {
  maxLen = maxLen || CHUNK_MAX;
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    const slice      = remaining.substring(0, maxLen);
    const candidates = [
      slice.lastIndexOf('. '),
      slice.lastIndexOf('! '),
      slice.lastIndexOf('? '),
      slice.lastIndexOf('\n'),
    ];
    let cut = Math.max(...candidates);
    if (cut < Math.floor(maxLen / 2)) cut = slice.lastIndexOf(', ');
    if (cut < 100) cut = maxLen - 1;
    chunks.push(remaining.substring(0, cut + 1).trim());
    remaining = remaining.substring(cut + 1).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

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

async function generateArticle(openai, htmlFile, outputFile, label) {
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
  return 'ok';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const openai = getOpenAI();

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
          generateArticle(openai, item.htmlFile, item.outputFile, item.label),
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
