const fs = require('fs');
const path = require('path');

const categoryImageMap = {
  'server-skills': 'https://servemasteracademy.ca/img/og/og-server-skills.png',
  'bartending':    'https://servemasteracademy.ca/img/og/og-bartending.png',
  'management':    'https://servemasteracademy.ca/img/og/og-management.png',
};

const dirs = [
  path.join(__dirname, '../public/blog/fr'),
  path.join(__dirname, '../public/blog/es'),
];

let fixed = 0;
let skipped = 0;
let errors = [];

for (const dir of dirs) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
  for (const file of files) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    const categoryMatch = content.match(/<meta name="blog-category" content="([^"]+)"/);
    if (!categoryMatch) {
      skipped++;
      errors.push(`No blog-category in ${filePath}`);
      continue;
    }
    const category = categoryMatch[1];
    const correctImage = categoryImageMap[category];
    if (!correctImage) {
      skipped++;
      errors.push(`Unknown category "${category}" in ${filePath}`);
      continue;
    }

    const updated = content.replace(
      /<meta property="og:image" content="https:\/\/servemasteracademy\.ca\/img\/og\/blog-article\.png"/,
      `<meta property="og:image" content="${correctImage}"`
    );

    if (updated === content) {
      skipped++;
      continue;
    }

    fs.writeFileSync(filePath, updated, 'utf8');
    fixed++;
  }
}

console.log(`Fixed: ${fixed}`);
console.log(`Skipped: ${skipped}`);
if (errors.length) {
  console.log('Issues:');
  errors.forEach(e => console.log(' -', e));
}
