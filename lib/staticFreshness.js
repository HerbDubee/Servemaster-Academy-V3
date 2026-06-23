const fs = require('fs');
const path = require('path');
const { gitLastCommitDate } = require('./blogFreshness');

const REPO_ROOT = path.join(__dirname, '..');

// ── Source of truth for static (non-blog) sitemap entries ──────────────────
// Each entry maps a public path to the HTML file that backs it, plus the
// sitemap metadata. `baseline` is a floor for <lastmod>: the effective date is
// the MORE RECENT of the baseline and the file's last git-commit date, so the
// sitemap freshens automatically when a page's HTML is updated and committed —
// but never goes backwards if git history is unavailable (e.g. fresh checkout).
const STATIC_PAGES = [
  { path: '/',                       file: 'public/home.html',                    baseline: '2026-06-02', priority: '1.0', changefreq: 'weekly'  },
  { path: '/features',               file: 'public/features.html',                baseline: '2026-06-02', priority: '0.9', changefreq: 'monthly' },
  { path: '/pricing',                file: 'public/pricing.html',                 baseline: '2026-06-02', priority: '0.9', changefreq: 'monthly' },
  { path: '/about',                  file: 'public/about.html',                   baseline: '2026-06-02', priority: '0.7', changefreq: 'monthly' },
  { path: '/contact',                file: 'public/contact.html',                 baseline: '2026-06-02', priority: '0.6', changefreq: 'monthly' },
  { path: '/ai-roleplay',            file: 'public/ai-roleplay.html',             baseline: '2026-06-02', priority: '0.8', changefreq: 'monthly' },
  { path: '/managers',               file: 'public/managers.html',                baseline: '2026-06-02', priority: '0.8', changefreq: 'monthly' },
  { path: '/teams',                  file: 'public/teams.html',                   baseline: '2026-06-02', priority: '0.8', changefreq: 'monthly' },
  { path: '/demo',                   file: 'public/demo.html',                    baseline: '2026-06-02', priority: '0.8', changefreq: 'monthly' },
  { path: '/checklist',              file: 'public/checklist.html',               baseline: '2026-06-02', priority: '0.8', changefreq: 'monthly' },
  { path: '/scholarship',            file: 'public/scholarship.html',             baseline: '2026-06-02', priority: '0.8', changefreq: 'monthly' },
  { path: '/affiliates',             file: 'public/affiliates.html',              baseline: '2026-06-02', priority: '0.7', changefreq: 'monthly' },
  { path: '/novels',                 file: 'public/novels-series.html',           baseline: '2026-06-02', priority: '0.8', changefreq: 'monthly' },
  { path: '/novels/first-crossings', file: 'public/novels-first-crossings.html',  baseline: '2026-06-02', priority: '0.8', changefreq: 'monthly' },
  { path: '/blog',                   file: 'public/blog/index.html',              baseline: '2026-05-25', priority: '0.8', changefreq: 'weekly'  },
];

// Returns the more recent of `baseline` and the file's last git-commit date.
// Falls back to `baseline` when the file is missing or has no git history.
function effectiveLastmod(file, baseline) {
  const abs = path.join(REPO_ROOT, file);
  if (!fs.existsSync(abs)) return baseline;
  const committed = gitLastCommitDate(file);
  if (!committed) return baseline;
  return committed > baseline ? committed : baseline;
}

// Build [path] -> resolved sitemap row. Computes git dates once (call at
// startup, not per-request, since each lookup shells out to `git log`).
function buildStaticSitemapRows() {
  return STATIC_PAGES.map(p => ({
    path: p.path,
    lastmod: effectiveLastmod(p.file, p.baseline),
    priority: p.priority,
    changefreq: p.changefreq,
  }));
}

// Compares declared baselines against git dates and reports any that are stale
// (file committed more recently than the baseline). Used by the check script.
function checkStaticFreshness() {
  const stale = [];
  const missing = [];
  const untracked = [];

  for (const p of STATIC_PAGES) {
    const abs = path.join(REPO_ROOT, p.file);
    if (!fs.existsSync(abs)) { missing.push(p); continue; }
    const committed = gitLastCommitDate(p.file);
    if (!committed) { untracked.push(p); continue; }
    if (committed > p.baseline) {
      stale.push({ path: p.path, file: p.file, baseline: p.baseline, fileLastCommit: committed });
    }
  }

  return { pages: STATIC_PAGES, stale, missing, untracked };
}

module.exports = { STATIC_PAGES, effectiveLastmod, buildStaticSitemapRows, checkStaticFreshness };
