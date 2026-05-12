#!/usr/bin/env node
/**
 * fix-blog-freshness.js
 *
 * Automatically updates the dateModified field in public/js/content.js for any
 * blog article whose HTML file has been committed more recently than its
 * declared dateModified value.
 *
 * Each stale article's dateModified is set to the date of its last git commit,
 * which is the same value the check script reports as "Last committed".
 *
 * Usage:
 *   node scripts/fix-blog-freshness.js
 *
 * After running, verify with:
 *   node scripts/check-blog-freshness.js
 *
 * Exit code:
 *   0  — no stale articles found, or all stale articles were fixed successfully
 *   1  — one or more fixes could not be applied (check output for details)
 */

const fs = require('fs');
const path = require('path');
const { checkFreshness } = require('../lib/blogFreshness');

const CONTENT_JS = path.join(__dirname, '../public/js/content.js');

function fixDateModified(source, slug, newDate) {
  // Build a pattern that matches the entire article object containing this slug.
  // We rely on the fact that article objects are flat (no nested braces) so we
  // can match from the opening { up to the next top-level }.
  const slugPattern = `slug\\s*:\\s*'${escapeRegex(slug)}'`;

  // Find the start of the object containing this slug.
  // Strategy: locate the slug, walk backwards to the nearest '{', then forwards
  // to the balanced '}' — all in one regex anchored on the slug token.
  // Because entries are flat objects (no nested braces per the parser in
  // blogFreshness.js) we can use a greedy match from { to the first } that
  // comes after the slug.
  const entryRegex = new RegExp(
    `(\\{[^{}]*?${slugPattern}[^{}]*?)` +   // group 1: everything up to …
    `(dateModified\\s*:\\s*')([^']+)(')` +  // group 2-4: existing dateModified
    `([^{}]*?\\})`,                          // group 5: rest of the object
    's'
  );

  if (entryRegex.test(source)) {
    // Article has an explicit dateModified — replace the date value.
    return source.replace(entryRegex, `$1$2${newDate}$4$5`);
  }

  // Article has no dateModified field yet — insert it after datePublished.
  const insertRegex = new RegExp(
    `(\\{[^{}]*?${slugPattern}[^{}]*?` +
    `datePublished\\s*:\\s*')([^']+)(')`,
    's'
  );

  if (insertRegex.test(source)) {
    return source.replace(
      insertRegex,
      `$1$2$3,\n    dateModified: '${newDate}'`
    );
  }

  return null; // could not patch
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function run() {
  const { articles, stale } = checkFreshness();

  if (articles.length === 0) {
    console.error('No articles parsed — check the regex against content.js.');
    process.exit(1);
  }

  if (stale.length === 0) {
    console.log('All article dateModified values are already up to date. Nothing to fix.');
    process.exit(0);
  }

  console.log(`Found ${stale.length} stale article(s). Applying fixes…\n`);

  let source = fs.readFileSync(CONTENT_JS, 'utf8');
  const failed = [];

  for (const { slug, fileLastCommit } of stale) {
    const patched = fixDateModified(source, slug, fileLastCommit);
    if (patched === null) {
      console.error(`  FAILED  ${slug} — could not locate entry in content.js`);
      failed.push(slug);
    } else {
      source = patched;
      console.log(`  FIXED   ${slug}  →  dateModified: '${fileLastCommit}'`);
    }
  }

  fs.writeFileSync(CONTENT_JS, source, 'utf8');

  if (failed.length > 0) {
    console.error(`\n${failed.length} article(s) could not be fixed automatically:`);
    failed.forEach(s => console.error(`  - ${s}`));
    console.error('\nUpdate those entries manually in public/js/content.js.');
    process.exit(1);
  }

  console.log(`\nAll ${stale.length} article(s) updated in public/js/content.js.`);
  console.log('Run `node scripts/check-blog-freshness.js` to verify.');
  process.exit(0);
}

run();
