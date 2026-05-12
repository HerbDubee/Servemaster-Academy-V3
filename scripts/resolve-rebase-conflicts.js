const fs = require('fs');
const path = require('path');

const frDir = path.join(__dirname, '../public/blog/fr');
const files = fs.readdirSync(frDir).filter(f => f.endsWith('.html'));

let resolved = 0;
let errors = 0;

for (const file of files) {
  const filePath = path.join(frDir, file);
  let html = fs.readFileSync(filePath, 'utf8');

  if (!html.includes('<<<<<<<')) continue;

  // For double-nested conflicts, collapse the whole mess into one resolution
  // Strategy: find the outermost <<<<<<< to the last >>>>>>> and replace with correct content

  // Extract twitter:image from anywhere in the conflict zone (HEAD always has it)
  const twitterImageMatch = html.match(/<meta name="twitter:image" content="([^"]+)"/);
  const twitterImage = twitterImageMatch
    ? twitterImageMatch[1]
    : 'https://servemasteracademy.ca/img/og/blog-article.png';

  // Extract the LAST og:title in the file (from the final 91a43a3 block - our best version)
  // In the conflict zone, the last og:title before >>>>>>> is our final version
  // We extract all og:title occurrences and take the last one
  const allOgTitles = [...html.matchAll(/<meta property="og:title" content="([^"]+)"/g)];
  const allOgDescs = [...html.matchAll(/<meta property="og:description" content="([^"]+)"/g)];

  if (allOgTitles.length === 0 || allOgDescs.length === 0) {
    console.error(`  ERROR: No og:title/description found in ${file}`);
    errors++;
    continue;
  }

  // Take the last occurrence (our final commit's version)
  const frOgTitle = allOgTitles[allOgTitles.length - 1][1];
  const frOgDesc = allOgDescs[allOgDescs.length - 1][1];

  // Replace the entire conflict zone (from first <<<<<<< to last >>>>>>>\n)
  // Use a non-greedy match that handles nested markers by matching from first <<< to last >>>
  const firstMarker = html.indexOf('<<<<<<<');
  const lastMarker = html.lastIndexOf('>>>>>>>');
  if (firstMarker === -1 || lastMarker === -1) {
    console.error(`  ERROR: Could not find conflict markers in ${file}`);
    errors++;
    continue;
  }

  // Find end of last >>>>>>> line
  const endOfLastMarker = html.indexOf('\n', lastMarker) + 1;

  const resolvedBlock = [
    `  <meta property="og:title" content="${frOgTitle}">`,
    `  <meta property="og:description" content="${frOgDesc}">`,
    `  <meta name="twitter:card" content="summary_large_image">`,
    `  <meta name="twitter:image" content="${twitterImage}">`,
    `  <meta name="twitter:title" content="${frOgTitle}">`,
    `  <meta name="twitter:description" content="${frOgDesc}">`,
  ].join('\n') + '\n';

  const newHtml = html.slice(0, firstMarker) + resolvedBlock + html.slice(endOfLastMarker);

  if (newHtml.includes('<<<<<<<')) {
    console.error(`  ERROR: Unresolved markers remain in ${file}`);
    errors++;
    continue;
  }

  fs.writeFileSync(filePath, newHtml, 'utf8');
  resolved++;
}

console.log(`Resolved: ${resolved}, Errors: ${errors}`);
