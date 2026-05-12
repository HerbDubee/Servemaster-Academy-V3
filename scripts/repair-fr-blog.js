const fs = require('fs');
const path = require('path');

const frDir = path.join(__dirname, '../public/blog/fr');

const BROKEN_FILES = [
  'graceful-no-thanks-recovery.html',
  'just-a-beer-guests.html',
  'just-water-beverage-revenue.html',
  'serving-as-a-career.html',
];

function unescapeHtml(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function escapeHtmlAttr(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

for (const file of BROKEN_FILES) {
  const filePath = path.join(frDir, file);
  let html = fs.readFileSync(filePath, 'utf8');
  const slug = file.replace('.html', '');

  const titleTagMatch = html.match(/<title>([^<]+)<\/title>/i);
  const rawTitle = titleTagMatch ? titleTagMatch[1] : '';
  const frTitleHtml = rawTitle.replace(/\s*–\s*ServeMaster Academy\s*$/, '').trim();
  const frTitle = unescapeHtml(frTitleHtml);

  const introMatch = html.match(/<p class="text-zinc-400 text-lg[^"]*">([^<]+)<\/p>/i);
  const frIntroHtml = introMatch ? introMatch[1].trim() : '';
  const frDesc = unescapeHtml(frIntroHtml);

  const frTitleAttr = escapeHtmlAttr(frTitle);
  const frDescAttr = escapeHtmlAttr(frDesc);
  const suffixedTitle = `${frTitleAttr} – ServeMaster Academy`;

  html = html.replace(
    /<meta property="og:title"[^>]*>/i,
    `<meta property="og:title" content="${suffixedTitle}">`
  );

  html = html.replace(
    /<meta property="og:description"[^>]*>/i,
    `<meta property="og:description" content="${frDescAttr}">`
  );

  html = html.replace(
    /<meta name="description"[^>]*>/i,
    `<meta name="description" content="${frDescAttr}">`
  );

  const frCanonical = `https://servemasteracademy.ca/blog/fr/${slug}`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://servemasteracademy.ca/"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Knowledge Centre",
        "item": "https://servemasteracademy.ca/blog"
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": frTitle,
        "item": frCanonical
      }
    ]
  };

  const newSchemaTag = `<script type="application/ld+json">\n  ${JSON.stringify(schema, null, 2).replace(/\n/g, '\n  ')}\n  </script>`;

  html = html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/i,
    newSchemaTag
  );

  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`REPAIRED: ${file} → "${frTitle}"`);

  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  if (m) {
    try { JSON.parse(m[1]); console.log(`  JSON-LD: VALID`); }
    catch (e) { console.error(`  JSON-LD: INVALID — ${e.message}`); }
  }
}
