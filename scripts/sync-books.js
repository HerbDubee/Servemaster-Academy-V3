#!/usr/bin/env node
/**
 * sync-books.js
 * Reads all .md files from /books and upserts them into the book_chapters table.
 * Run after git pull: node scripts/sync-books.js
 */

const fs = require('fs');
const path = require('path');
const db = require('../db');

const BOOKS_DIR = path.join(__dirname, '..', 'books');

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
  const content = match[2].trim();
  return { frontmatter, content };
}

async function syncBooks() {
  if (!fs.existsSync(BOOKS_DIR)) {
    console.error(`books/ directory not found at ${BOOKS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(BOOKS_DIR).filter(f => f.endsWith('.md') && f !== 'README.md');

  if (!files.length) {
    console.log('No .md chapter files found in books/. Nothing to sync.');
    process.exit(0);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const file of files) {
    const raw = fs.readFileSync(path.join(BOOKS_DIR, file), 'utf8');
    const parsed = parseFrontmatter(raw);

    if (!parsed) {
      console.warn(`  SKIP ${file} — missing or invalid frontmatter`);
      skipped++;
      continue;
    }

    const { frontmatter, content } = parsed;
    const book_title = (frontmatter.book || '').trim();
    const chapter_number = parseInt(frontmatter.chapter, 10) || 1;
    const chapter_title = (frontmatter.title || '').trim();
    const is_published = String(frontmatter.published).toLowerCase() === 'true';

    if (!book_title) {
      console.warn(`  SKIP ${file} — "book" field is missing from frontmatter`);
      skipped++;
      continue;
    }

    const existing = await db.query(
      'SELECT id FROM book_chapters WHERE book_title = $1 AND chapter_number = $2',
      [book_title, chapter_number]
    );

    if (existing.rows.length) {
      await db.query(
        `UPDATE book_chapters
         SET chapter_title=$1, content=$2, is_published=$3, updated_at=NOW()
         WHERE book_title=$4 AND chapter_number=$5`,
        [chapter_title, content, is_published, book_title, chapter_number]
      );
      console.log(`  UPDATE "${book_title}" Ch.${chapter_number} — ${chapter_title}`);
      updated++;
    } else {
      await db.query(
        `INSERT INTO book_chapters (book_title, chapter_number, chapter_title, content, is_published)
         VALUES ($1, $2, $3, $4, $5)`,
        [book_title, chapter_number, chapter_title, content, is_published]
      );
      console.log(`  INSERT "${book_title}" Ch.${chapter_number} — ${chapter_title}`);
      inserted++;
    }
  }

  console.log(`\nDone. ${inserted} inserted, ${updated} updated, ${skipped} skipped.`);
  process.exit(0);
}

syncBooks().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
