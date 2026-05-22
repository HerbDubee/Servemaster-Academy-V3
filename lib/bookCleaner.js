'use strict';

/**
 * Clean a markdown chapter into plain prose suitable for ElevenLabs TTS narration.
 *
 * Strips  : YAML frontmatter, markdown syntax (headers/bold/italic/links/code),
 *           horizontal rules, "End of Chapter" lines, revision/version metadata.
 * Preserves: paragraph breaks (natural pauses), dialogue punctuation, em-dashes,
 *            ellipses, foreign-language phrases, and sentence rhythm.
 * Never   : silently swallows errors or uses a fallback voice.
 */
function cleanForTTS(markdown) {
  if (typeof markdown !== 'string') throw new TypeError('cleanForTTS: input must be a string');
  if (!markdown.trim()) throw new Error('cleanForTTS: input is empty');

  let text = markdown;

  // 1. Strip YAML frontmatter (---...--- block at top)
  text = text.replace(/^---[\s\S]*?---\n?/, '');

  // 2. Remove horizontal rules (---, ***, ___, standalone)
  text = text.replace(/^[-*_]{3,}\s*$/gm, '');

  // 3. Remove markdown headings (# ## ### etc.) — chapter/section headings not narrated
  text = text.replace(/^#{1,6}\s+.+$/gm, '');

  // 4. Remove "End of Chapter N" lines and close variants
  text = text.replace(/^End of Chapter\s*\d*\.?\s*$/gim, '');

  // 5. Remove revision / version / word-count metadata lines
  text = text.replace(/^(Revision|Version|v\d[\d.]*|Word[_ ]?count|Draft)[^\n]*$/gim, '');

  // 6. Strip bold+italic, bold, italic — preserve the inner text
  text = text.replace(/\*{3}([^*\n]+)\*{3}/g, '$1');
  text = text.replace(/\*{2}([^*\n]+)\*{2}/g, '$1');
  // Italic asterisk: guard against em-dashes (*Più sale!* keeps the phrase)
  text = text.replace(/\*([^*\n]{1,300})\*/g, '$1');
  // Italic underscore (not part of a word boundary)
  text = text.replace(/(?<!\w)_([^_\n]{1,300})_(?!\w)/g, '$1');

  // 7. Remove markdown links [text](url) → text only
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 8. Remove images ![alt](url)
  text = text.replace(/!\[[^\]]*\]\([^)]+\)/g, '');

  // 9. Remove inline code `...`
  text = text.replace(/`[^`\n]+`/g, '');

  // 10. Convert double-dash surrounded by spaces to em-dash (natural pause for TTS)
  text = text.replace(/ -- /g, ' — ');

  // 11. Normalize ellipsis variants to Unicode ellipsis
  text = text.replace(/\.{3}/g, '…');

  // 12. Collapse 3+ blank lines to double newline (paragraph boundary)
  text = text.replace(/\n{3,}/g, '\n\n');

  // 13. Remove lines that are entirely whitespace
  text = text.replace(/^\s+$/gm, '');

  // 14. Final trim
  text = text.trim();

  if (!text) throw new Error('cleanForTTS: result is empty after cleaning — check input markdown');

  return text;
}

/**
 * Split cleaned prose into chunks ≤ maxChars, breaking on paragraph then sentence
 * boundaries. Keeps ElevenLabs per-request character limits safe.
 * Default 4500 chars gives a comfortable margin below the 5000-char API limit.
 */
function chunkForTTS(text, maxChars = 4500) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new TypeError('chunkForTTS: input must be a non-empty string');
  }

  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let current = '';

  for (const para of paragraphs) {
    const separator = current ? '\n\n' : '';
    const candidate = current + separator + para;

    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      // Flush current buffer before handling this paragraph
      if (current) {
        chunks.push(current);
        current = '';
      }
      // If the paragraph itself is within limit, start a new buffer with it
      if (para.length <= maxChars) {
        current = para;
      } else {
        // Split oversized paragraph by sentences
        const sentences = para.match(/[^.!?…]+[.!?…]+(?:\s|$)|[^.!?…]+$/g) || [para];
        for (const s of sentences) {
          const c2 = current ? current + ' ' + s.trim() : s.trim();
          if (c2.length <= maxChars) {
            current = c2;
          } else {
            if (current) chunks.push(current);
            current = s.trim();
          }
        }
      }
    }
  }

  if (current) chunks.push(current);
  return chunks.filter(c => c.trim().length > 0);
}

module.exports = { cleanForTTS, chunkForTTS };
