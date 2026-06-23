#!/usr/bin/env node
/**
 * check-sitemap-freshness.js
 *
 * Compares each static (non-blog) sitemap page's declared `baseline` date in
 * lib/staticFreshness.js against the date of the last git commit that touched
 * the page's backing HTML file.
 *
 * Note: the running sitemap already self-heals — /sitemap.xml uses the MORE
 * RECENT of the baseline and the file's last git-commit date at startup, so a
 * stale baseline does NOT produce a stale sitemap. This script is an advisory:
 * it flags baselines that have drifted so they can be bumped to keep the
 * source-of-truth tidy and honest.
 *
 * Usage:
 *   node scripts/check-sitemap-freshness.js
 *
 * Exit code:
 *   0  — all baselines are current
 *   1  — one or more baselines are older than their file's last commit
 *
 * Uses `git log` for timestamps so results are stable across clones and CI
 * (filesystem mtime resets on checkout; git log does not).
 */

const { checkStaticFreshness } = require('../lib/staticFreshness');

function run() {
  const { pages, stale, missing, untracked } = checkStaticFreshness();

  console.log(`Checked ${pages.length} static pages.\n`);

  if (missing.length > 0) {
    console.warn('Pages with no backing HTML file (skipped):');
    missing.forEach(p => console.warn(`  - ${p.path} (${p.file})`));
    console.log('');
  }

  if (untracked.length > 0) {
    console.warn('Pages whose HTML file has no git history yet (skipped):');
    untracked.forEach(p => console.warn(`  - ${p.path} (${p.file})`));
    console.log('');
  }

  if (stale.length === 0) {
    console.log('All static-page baselines are up to date.');
    process.exit(0);
  }

  console.error(`${stale.length} page(s) have HTML files committed more recently than their declared baseline:\n`);
  for (const { path: p, file, baseline, fileLastCommit } of stale) {
    console.error(`  ${p}  (${file})`);
    console.error(`    Last committed   : ${fileLastCommit}`);
    console.error(`    Declared baseline: ${baseline}`);
    console.error('');
  }

  console.error('Action: bump the `baseline` for each page above in');
  console.error('  lib/staticFreshness.js  (STATIC_PAGES array)');
  console.error('to its last-committed date. Or run: node scripts/fix-sitemap-freshness.js');

  process.exit(1);
}

run();
