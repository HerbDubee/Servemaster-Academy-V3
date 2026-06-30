'use strict';

// Shared blog-article → speakable-text helpers, used by both the offline
// pre-generation script (scripts/generate-blog-audio.js) and the server's
// on-demand blog-audio synthesis fallback. Keeping the extraction, TTS
// pre-processing, and chunking in one place guarantees the audio synthesized on
// demand matches the pre-generated MP3s byte-for-input.

const TTS_MODEL = 'tts-1';
const TTS_VOICE = 'nova';
const CHUNK_MAX = 3900; // chars per TTS call (server limit is 4000; leave headroom)

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

module.exports = {
  TTS_MODEL,
  TTS_VOICE,
  CHUNK_MAX,
  decodeEntities,
  stripTags,
  extractText,
  preprocessForTTS,
  splitIntoChunks,
};
