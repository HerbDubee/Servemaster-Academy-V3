#!/usr/bin/env node
/**
 * sync-books.js
 * Fetches .md files from the books/ folder on GitHub (origin/main) via the
 * GitHub API and upserts them into the book_chapters table.
 * Works in both local dev (with git) and production (no .git directory).
 *
 * Requires: GITHUB_TOKEN env var for private repos.
 * Repo / branch configured via BOOKS_GITHUB_REPO, BOOKS_GITHUB_BRANCH, BOOKS_GITHUB_DIR
 * (defaults: HerbDubee/servemaster-openclaw-ops, main, servemaster-academy/books).
 *
 * Usage:
 *   node scripts/sync-books.js
 */

const https = require('https');
const db = require('../db');

const REPO   = process.env.BOOKS_GITHUB_REPO   || 'HerbDubee/servemaster-openclaw-ops';
const BRANCH = process.env.BOOKS_GITHUB_BRANCH || 'main';
const DIR    = process.env.BOOKS_GITHUB_DIR    || 'servemaster-academy/books';
const TOKEN  = process.env.GITHUB_TOKEN;
const SKIP   = ['README.md', 'STATUS.md'];

function ghGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'servemaster-books-sync',
        'Accept': 'application/vnd.github+json',
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from GitHub API')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function listMdFiles() {
  const items = await ghGet(`/repos/${REPO}/contents/${DIR}?ref=${BRANCH}`);
  if (items.message) throw new Error(`GitHub API: ${items.message}`);
  return items.filter(f => f.type === 'file' && f.name.endsWith('.md') && !SKIP.includes(f.name));
}

async function fetchFileContent(downloadUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(downloadUrl);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'User-Agent': 'servemaster-books-sync',
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const frontmatter = {};
  match[1].split(/\r?\n/).forEach(line => {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      const val = rest.join(':').trim();
      frontmatter[key.trim()] = val.replace(/^['"]|['"]$/g, '');
    }
  });
  return { frontmatter, content: match[2].trim() };
}

function parseFilename(file) {
  const base = file.replace(/\.md$/, '').replace(/^books\//, '');
  const chMatch = base.match(/[-_]ch?(\d+)$/i);
  const novelMatch = base.match(/[-_]novel(\d+)$/i);
  const numMatch = base.match(/(\d+)$/);
  const chapter_number = chMatch ? parseInt(chMatch[1]) : novelMatch ? parseInt(novelMatch[1]) : numMatch ? parseInt(numMatch[1]) : 1;
  const slug = base
    .replace(/[-_]ch?\d+$/i, '')
    .replace(/[-_]novel\d+$/i, '')
    .replace(/\d+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  const book_title = slug
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  return { book_title: book_title || base, chapter_number, chapter_title: `Chapter ${chapter_number}` };
}

async function upsertChapter({ book_title, chapter_number, chapter_title, content, is_published }) {
  const existing = await db.query(
    'SELECT id FROM book_chapters WHERE book_title = $1 AND chapter_number = $2',
    [book_title, chapter_number]
  );
  if (existing.rows.length) {
    await db.query(
      `UPDATE book_chapters SET chapter_title=$1, content=$2, is_published=$3, updated_at=NOW()
       WHERE book_title=$4 AND chapter_number=$5`,
      [chapter_title, content, is_published, book_title, chapter_number]
    );
    return 'updated';
  } else {
    await db.query(
      `INSERT INTO book_chapters (book_title, chapter_number, chapter_title, content, is_published)
       VALUES ($1, $2, $3, $4, $5)`,
      [book_title, chapter_number, chapter_title, content, is_published]
    );
    return 'inserted';
  }
}

async function syncBooks() {
  let files;
  try {
    files = await listMdFiles();
  } catch (e) {
    console.error('Failed to list files from GitHub:', e.message);
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  if (!files.length) {
    console.log(`No .md files found in ${DIR}/ on ${REPO}@${BRANCH}.`);
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  // Sort so base files come first, then variants (_v2, _Polished, etc.) come last.
  // This ensures the latest revision wins when multiple files share the same chapter number.
  files.sort((a, b) => {
    const isVariant = f => /_v\d+|_polished|_rewrite|_revised/i.test(f.name);
    if (isVariant(a) && !isVariant(b)) return 1;
    if (!isVariant(a) && isVariant(b)) return -1;
    return a.name.localeCompare(b.name);
  });

  console.log(`Syncing from https://github.com/${REPO}/tree/${BRANCH}/${DIR}`);
  console.log(`Found ${files.length} .md file(s) in ${DIR}/ — syncing…`);
  let inserted = 0, updated = 0, skipped = 0;

  for (const file of files) {
    let raw;
    try {
      raw = await fetchFileContent(file.download_url);
    } catch (e) {
      console.warn(`  SKIP ${file.name} — download error: ${e.message}`);
      skipped++;
      continue;
    }

    if (!raw || !raw.trim()) {
      console.warn(`  SKIP ${file.name} — empty file`);
      skipped++;
      continue;
    }

    let book_title, chapter_number, chapter_title, content, is_published;

    const parsed = parseFrontmatter(raw);
    if (parsed) {
      const { frontmatter } = parsed;
      book_title     = (frontmatter.book || '').trim();
      chapter_number = parseInt(frontmatter.chapter, 10) || 1;
      chapter_title  = (frontmatter.title || `Chapter ${chapter_number}`).trim();
      content        = parsed.content;
      is_published   = String(frontmatter.published).toLowerCase() === 'true';
    } else {
      const fromFile = parseFilename(file.name);
      book_title     = fromFile.book_title;
      chapter_number = fromFile.chapter_number;
      chapter_title  = fromFile.chapter_title;
      content        = raw.trim();
      is_published   = false;
    }

    if (!book_title || content === '[paste full Chapter 1 prose from chat here — copy from earlier response]') {
      console.warn(`  SKIP ${file.name} — placeholder or missing book title`);
      skipped++;
      continue;
    }

    const action = await upsertChapter({ book_title, chapter_number, chapter_title, content, is_published });
    console.log(`  ${action.toUpperCase()} "${book_title}" Ch.${chapter_number} — ${chapter_title} (${content.trim().split(/\s+/).length.toLocaleString()} words)`);
    if (action === 'inserted') inserted++; else updated++;
  }

  console.log(`\nDone. ${inserted} inserted, ${updated} updated, ${skipped} skipped.`);
  return { inserted, updated, skipped };
}

if (require.main === module) {
  syncBooks().then(() => process.exit(0)).catch(err => { console.error('Fatal:', err.message); process.exit(1); });
}

module.exports = { syncBooks };
