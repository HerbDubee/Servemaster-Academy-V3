#!/usr/bin/env node
/**
 * check-blog-freshness.js
 *
 * Compares each blog article's declared dateModified (or datePublished fallback)
 * in public/js/content.js against the date of the last git commit that touched
 * the corresponding HTML file in public/blog/.
 *
 * Flags any article whose HTML file was committed more recently than its
 * declared date, indicating the dateModified field in content.js needs updating.
 *
 * Usage:
 *   node scripts/check-blog-freshness.js
 *
 * Exit code:
 *   0  — all articles are up to date
 *   1  — one or more articles have stale dateModified values
 *
 * Note: Uses `git log` for timestamps so results are stable across clones
 * and CI environments (filesystem mtime resets on checkout; git log does not).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONTENT_JS = path.join(__dirname, '../public/js/content.js');
const BLOG_DIR = path.join(__dirname, '../public/blog');
const REPO_ROOT = path.join(__dirname, '..');

function parseArticles(source) {
  const match = source.match(/const blogArticles\s*=\s*\[([\s\S]*?)\];/);
  if (!match) throw new Error('Could not locate blogArticles array in content.js');

  const entries = [];
  const entryRegex = /\{[^{}]*slug\s*:\s*'([^']+)'[^{}]*datePublished\s*:\s*'([^']+)'[^{}]*\}/g;
  const modifiedRegex = /dateModified\s*:\s*'([^']+)'/;

  let m;
  while ((m = entryRegex.exec(match[1])) !== null) {
    const fullEntry = m[0];
    const slug = m[1];
    const datePublished = m[2];
    const modMatch = fullEntry.match(modifiedRegex);
    const dateModified = modMatch ? modMatch[1] : datePublished;
    entries.push({ slug, datePublished, dateModified, hasExplicitModified: !!modMatch });
  }
  return entries;
}

function gitLastCommitDate(relPath) {
  try {
    const result = execSync(
      `git log -1 --format=%cs -- "${relPath}"`,
      { cwd: REPO_ROOT, stdio: ['pipe', 'pipe', 'pipe'] }
    ).toString().trim();
    return result || null;
  } catch {
    return null;
  }
}

function toMidnightUTC(dateStr) {
  return new Date(dateStr + 'T00:00:00Z');
}

function run() {
  const source = fs.readFileSync(CONTENT_JS, 'utf8');
  const articles = parseArticles(source);

  if (articles.length === 0) {
    console.error('No articles parsed — check the regex against content.js.');
    process.exit(1);
  }

  const stale = [];
  const missing = [];
  const untracked = [];

  for (const { slug, datePublished, dateModified, hasExplicitModified } of articles) {
    const htmlPath = path.join(BLOG_DIR, `${slug}.html`);
    const relPath = path.relative(REPO_ROOT, htmlPath);

    if (!fs.existsSync(htmlPath)) {
      missing.push(slug);
      continue;
    }

    const lastCommit = gitLastCommitDate(relPath);

    if (!lastCommit) {
      untracked.push(slug);
      continue;
    }

    const fileDate = toMidnightUTC(lastCommit);
    const declaredDate = toMidnightUTC(dateModified);

    if (fileDate > declaredDate) {
      stale.push({
        slug,
        fileLastCommit: lastCommit,
        declaredDateModified: dateModified,
        usingFallback: !hasExplicitModified,
      });
    }
  }

  console.log(`Checked ${articles.length} articles.\n`);

  if (missing.length > 0) {
    console.warn('Articles with no matching HTML file (skipped):');
    missing.forEach(s => console.warn(`  - ${s}`));
    console.log('');
  }

  if (untracked.length > 0) {
    console.warn('Articles whose HTML file has no git history yet (skipped):');
    untracked.forEach(s => console.warn(`  - ${s}`));
    console.log('');
  }

  if (stale.length === 0) {
    console.log('All article dateModified values are up to date.');
    process.exit(0);
  }

  console.error(`${stale.length} article(s) have HTML files committed more recently than their declared dateModified:\n`);
  for (const { slug, fileLastCommit, declaredDateModified, usingFallback } of stale) {
    const note = usingFallback ? ' (no dateModified set — using datePublished as baseline)' : '';
    console.error(`  ${slug}`);
    console.error(`    Last committed          : ${fileLastCommit}`);
    console.error(`    Declared dateModified   : ${declaredDateModified}${note}`);
    console.error('');
  }

  console.error('Action required: update the dateModified field for each article above in');
  console.error('  public/js/content.js  (blogArticles array)');
  console.error("Use the article's last-committed date (YYYY-MM-DD) if that revision was");
  console.error("meaningful, or today's date if you're revising it now.");

  process.exit(1);
}

run();
