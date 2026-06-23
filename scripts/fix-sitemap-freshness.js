#!/usr/bin/env node
/**
 * fix-sitemap-freshness.js
 *
 * Bumps the `baseline` date in lib/staticFreshness.js for any static page whose
 * backing HTML file has been committed more recently than its declared
 * baseline. Each stale baseline is set to the file's last git-commit date — the
 * same value check-sitemap-freshness.js reports as "Last committed".
 *
 * Usage:
 *   node scripts/fix-sitemap-freshness.js
 *
 * After running, verify with:
 *   node scripts/check-sitemap-freshness.js
 *
 * Exit code:
 *   0  — no stale baselines found, or all were fixed successfully
 *   1  — one or more fixes could not be applied (check output for details)
 */

const fs = require('fs');
const path = require('path');
const { checkStaticFreshness } = require('../lib/staticFreshness');

const LIB_FILE = path.join(__dirname, '../lib/staticFreshness.js');

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function run() {
  const { stale } = checkStaticFreshness();

  if (stale.length === 0) {
    console.log('No stale static-page baselines found. Nothing to do.');
    process.exit(0);
  }

  let source = fs.readFileSync(LIB_FILE, 'utf8');
  let fixed = 0;
  const failed = [];

  for (const { path: p, baseline, fileLastCommit } of stale) {
    // Scope the replacement to the row object for this exact path so we only
    // touch this page's baseline. Rows are flat objects (no nested braces).
    const rowRegex = new RegExp(
      `(\\{[^{}]*?path:\\s*'${escapeRegex(p)}'[^{}]*?baseline:\\s*')([^']+)(')`,
      's'
    );
    if (rowRegex.test(source)) {
      source = source.replace(rowRegex, `$1${fileLastCommit}$3`);
      fixed++;
      console.log(`  ${p}: ${baseline} -> ${fileLastCommit}`);
    } else {
      failed.push(p);
    }
  }

  fs.writeFileSync(LIB_FILE, source, 'utf8');

  if (failed.length > 0) {
    console.error(`\nCould not update ${failed.length} page(s):`);
    failed.forEach(p => console.error(`  - ${p}`));
    process.exit(1);
  }

  console.log(`\nUpdated ${fixed} baseline(s) in lib/staticFreshness.js.`);
  console.log('Verify with: node scripts/check-sitemap-freshness.js');
  process.exit(0);
}

run();
