const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const W = 1080;
const H = 1350;

const ORANGE = '#FF5E3A';
const TEAL   = '#0A4D68';
const WHITE  = '#FFFFFF';
const OFFWHITE = '#F0EDE8';
const DARK   = '#06283D';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="${DARK}"/>
      <stop offset="100%" stop-color="#081F30"/>
    </linearGradient>
    <linearGradient id="ctaGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="${ORANGE}"/>
      <stop offset="100%" stop-color="#FF7A5C"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- Subtle texture overlay band -->
  <rect x="0" y="0" width="${W}" height="6" fill="${ORANGE}" opacity="1"/>

  <!-- Top accent bar -->
  <rect x="80" y="90" width="64" height="6" fill="${ORANGE}" rx="3"/>

  <!-- Brand name -->
  <text x="80" y="160"
        font-family="'Montserrat', 'Arial Black', sans-serif"
        font-size="32" font-weight="700" letter-spacing="6"
        fill="${OFFWHITE}" opacity="0.75">SERVEM&#x41;STER ACADEMY</text>

  <!-- Main headline line 1 -->
  <text x="80" y="330"
        font-family="'Montserrat', 'Arial Black', sans-serif"
        font-size="114" font-weight="900" letter-spacing="-2"
        fill="${WHITE}">Train</text>

  <!-- Main headline line 2 — orange -->
  <text x="80" y="460"
        font-family="'Montserrat', 'Arial Black', sans-serif"
        font-size="114" font-weight="900" letter-spacing="-2"
        fill="${ORANGE}">Smarter.</text>

  <!-- Main headline line 3 -->
  <text x="80" y="590"
        font-family="'Montserrat', 'Arial Black', sans-serif"
        font-size="114" font-weight="900" letter-spacing="-2"
        fill="${WHITE}">Tip</text>

  <!-- Main headline line 4 — orange -->
  <text x="80" y="720"
        font-family="'Montserrat', 'Arial Black', sans-serif"
        font-size="114" font-weight="900" letter-spacing="-2"
        fill="${ORANGE}">Bigger.</text>

  <!-- Divider -->
  <rect x="80" y="780" width="920" height="1.5" fill="${WHITE}" opacity="0.12"/>

  <!-- Sub-points -->
  <!-- Dot 1 -->
  <circle cx="94" cy="840" r="5" fill="${ORANGE}"/>
  <text x="118" y="853"
        font-family="'Inter', 'Arial', sans-serif"
        font-size="32" font-weight="400"
        fill="${OFFWHITE}" opacity="0.85">30 training modules across 4 career tracks</text>

  <!-- Dot 2 -->
  <circle cx="94" cy="912" r="5" fill="${ORANGE}"/>
  <text x="118" y="925"
        font-family="'Inter', 'Arial', sans-serif"
        font-size="32" font-weight="400"
        fill="${OFFWHITE}" opacity="0.85">AI role-play with real guest scenarios</text>

  <!-- Dot 3 -->
  <circle cx="94" cy="984" r="5" fill="${ORANGE}"/>
  <text x="118" y="997"
        font-family="'Inter', 'Arial', sans-serif"
        font-size="32" font-weight="400"
        fill="${OFFWHITE}" opacity="0.85">Earn certificates. Stand out. Earn more.</text>

  <!-- Divider -->
  <rect x="80" y="1054" width="920" height="1.5" fill="${WHITE}" opacity="0.12"/>

  <!-- CTA pill -->
  <rect x="80" y="1098" width="920" height="108" fill="url(#ctaGrad)" rx="16"/>

  <!-- CTA text line 1 -->
  <text x="540" y="1148"
        font-family="'Montserrat', 'Arial Black', sans-serif"
        font-size="30" font-weight="700" letter-spacing="1"
        fill="${WHITE}" text-anchor="middle">Start your training at</text>

  <!-- CTA text line 2 — URL -->
  <text x="540" y="1190"
        font-family="'Montserrat', 'Arial Black', sans-serif"
        font-size="30" font-weight="900" letter-spacing="1"
        fill="${WHITE}" text-anchor="middle">servemasteracademy.ca</text>

  <!-- Bottom tagline -->
  <text x="540" y="1302"
        font-family="'Inter', 'Arial', sans-serif"
        font-size="24" font-weight="400" letter-spacing="2"
        fill="${WHITE}" opacity="0.35" text-anchor="middle">RESTAURANT SERVER TRAINING</text>
</svg>`;

async function main() {
  const outDir = path.join(__dirname, '..', 'exports');
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, 'instagram-post-1080x1350.png');

  await sharp(Buffer.from(svg))
    .png({ quality: 100, compressionLevel: 6 })
    .toFile(outFile);

  const { width, height } = await sharp(outFile).metadata();
  console.log(`✓ Saved: ${outFile}`);
  console.log(`  Size: ${width}×${height}px`);
}

main().catch(err => { console.error(err); process.exit(1); });
