#!/usr/bin/env node
/**
 * sync-books.js
 * Reads .md files from the books/ folder on origin/main (no checkout needed)
 * and upserts them into the book_chapters table.
 *
 * Usage:
 *   node scripts/sync-books.js              ← fetches + syncs
 *   node scripts/sync-books.js --no-fetch   ← skips git fetch (already done)
 */

const { execSync } = require('child_process');
const db = require('../db');

const NO_FETCH = process.argv.includes('--no-fetch');
const BRANCH = 'origin/main';
const BOOKS_DIR = 'books';

function gitFetch() {
  try {
    execSync('git fetch origin', { stdio: 'pipe' });
  } catch (e) {
    console.warn('git fetch warning:', e.stderr?.toString().trim());
  }
}

function listMdFiles() {
  try {
    const out = execSync(`git ls-tree --name-only ${BRANCH} ${BOOKS_DIR}/`, { stdio: 'pipe' }).toString();
    const SKIP = ['README.md', 'STATUS.md'];
    return out.split('\n')
      .map(f => f.trim())
      .filter(f => f.endsWith('.md') && !SKIP.some(s => f.endsWith(s)));
  } catch {
    return [];
  }
}

function readFile(file) {
  try {
    return execSync(`git show ${BRANCH}:${file}`, { stdio: 'pipe' }).toString();
  } catch {
    return null;
  }
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
  if (!NO_FETCH) gitFetch();

  const files = listMdFiles();
  if (!files.length) {
    console.log(`No .md files found in ${BOOKS_DIR}/ on ${BRANCH}. Nothing to sync.`);
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  let inserted = 0, updated = 0, skipped = 0;

  for (const file of files) {
    const raw = readFile(file);
    if (!raw || !raw.trim()) { console.warn(`  SKIP ${file} — could not read`); skipped++; continue; }

    let book_title, chapter_number, chapter_title, content, is_published;

    const parsed = parseFrontmatter(raw);
    if (parsed) {
      const { frontmatter } = parsed;
      book_title = (frontmatter.book || '').trim();
      chapter_number = parseInt(frontmatter.chapter, 10) || 1;
      chapter_title = (frontmatter.title || `Chapter ${chapter_number}`).trim();
      content = parsed.content;
      is_published = String(frontmatter.published).toLowerCase() === 'true';
    } else {
      const fromFile = parseFilename(file);
      book_title = fromFile.book_title;
      chapter_number = fromFile.chapter_number;
      chapter_title = fromFile.chapter_title;
      content = raw.trim();
      is_published = false;
    }

    if (!book_title || content === '[paste full Chapter 1 prose from chat here — copy from earlier response]') {
      console.warn(`  SKIP ${file} — placeholder or missing book title`);
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
