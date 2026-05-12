const fs = require('fs');
const path = require('path');

const esDir = path.join(__dirname, '../public/blog/es');
const files = fs.readdirSync(esDir).filter(f => f.endsWith('.html'));

const categoryImageMap = {
  'server-skills': 'og-server-skills.png',
  'bartending': 'og-bartending.png',
  'management': 'og-management.png',
};

function escapeAttr(str) {
  return str
    .replace(/&(?!(?:amp|quot|lt|gt|apos);)/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function decodeEntities(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'");
}

function extractAttr(html, pattern) {
  const m = html.match(pattern);
  if (!m) return null;
  return decodeEntities(m[1].trim());
}

const INSERTED_BLOCK_RE = /\n  <meta property="og:title"[^\n]*\n  <meta property="og:description"[^\n]*\n  <meta name="twitter:card"[^\n]*\n  <meta name="twitter:image"[^\n]*\n  <meta name="twitter:title"[^\n]*\n  <meta name="twitter:description"[^\n]*/g;

let updated = 0;
let errors = [];

for (const file of files) {
  const filePath = path.join(esDir, file);
  let html = fs.readFileSync(filePath, 'utf8');

  html = html.replace(INSERTED_BLOCK_RE, '');

  const title = extractAttr(html, /<title>([\s\S]*?)<\/title>/);
  const description = extractAttr(html, /<meta\s+name="description"\s+content="([\s\S]*?)">/);
  const categoryMatch = html.match(/<meta\s+name="blog-category"\s+content="([^"]+)"/);

  if (!title || !description) {
    errors.push(`${file}: missing title or description`);
    continue;
  }

  const safeTitle = escapeAttr(title);
  const safeDesc = escapeAttr(description);
  const category = categoryMatch ? categoryMatch[1].trim() : 'server-skills';
  const ogImageFile = categoryImageMap[category] || 'og-server-skills.png';
  const ogImageUrl = `https://servemasteracademy.ca/img/og/${ogImageFile}`;

  const newTags = `\n  <meta property="og:title" content="${safeTitle}">\n  <meta property="og:description" content="${safeDesc}">\n  <meta name="twitter:card" content="summary_large_image">\n  <meta name="twitter:image" content="${ogImageUrl}">\n  <meta name="twitter:title" content="${safeTitle}">\n  <meta name="twitter:description" content="${safeDesc}">`;

  const insertAfter = `  <meta property="og:image:height" content="630">`;
  if (html.includes(insertAfter)) {
    html = html.replace(insertAfter, `${insertAfter}${newTags}`);
  } else {
    const ogImageTag = `  <meta property="og:image" content="https://servemasteracademy.ca/img/og/blog-article.png">`;
    if (html.includes(ogImageTag)) {
      html = html.replace(ogImageTag, `${ogImageTag}${newTags}`);
    } else {
      const canonicalMatch = html.match(/<link rel="canonical"[^>]+>/);
      if (canonicalMatch) {
        html = html.replace(canonicalMatch[0], `${canonicalMatch[0]}${newTags}`);
      } else {
        errors.push(`${file}: could not find insertion point`);
        continue;
      }
    }
  }

  fs.writeFileSync(filePath, html, 'utf8');
  updated++;
}

console.log(`Done. Updated: ${updated}`);
if (errors.length) {
  console.log('Errors:');
  errors.forEach(e => console.log(' -', e));
}
