const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../public/blog/fr');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

let updated = 0;
let skipped = 0;

files.forEach(file => {
  const filePath = path.join(dir, file);
  let html = fs.readFileSync(filePath, 'utf8');

  if (html.includes('BreadcrumbList')) {
    skipped++;
    return;
  }

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)"/i);

  if (!titleMatch || !canonicalMatch) {
    console.warn(`  WARN: Missing title or canonical in ${file}`);
    return;
  }

  const rawTitle = titleMatch[1];
  const articleTitle = rawTitle
    .replace(/\s*[–—-]\s*ServeMaster Academy\s*$/, '')
    .trim();
  const canonicalUrl = canonicalMatch[1].trim();

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
        "name": articleTitle,
        "item": canonicalUrl
      }
    ]
  };

  const schemaTag = `\n  <script type="application/ld+json">\n  ${JSON.stringify(schema, null, 2).replace(/\n/g, '\n  ')}\n  </script>`;

  html = html.replace('</head>', schemaTag + '\n</head>');

  fs.writeFileSync(filePath, html, 'utf8');
  updated++;
  console.log(`  OK: ${file} → "${articleTitle}"`);
});

console.log(`\nDone. Updated: ${updated}, Skipped (already had schema): ${skipped}, Total: ${files.length}`);
