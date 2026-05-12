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

function checkFreshness() {
  const source = fs.readFileSync(CONTENT_JS, 'utf8');
  const articles = parseArticles(source);

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

  return { articles, stale, missing, untracked };
}

module.exports = { checkFreshness };
