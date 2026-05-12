const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../public/blog');
const destDir = path.join(__dirname, '../public/blog/fr');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.html') && f !== 'article.html' && f !== 'index.html');

let created = 0;
let skipped = 0;

files.forEach(file => {
  const slug = file.replace('.html', '');
  const destPath = path.join(destDir, file);

  if (fs.existsSync(destPath)) {
    skipped++;
    return;
  }

  const srcPath = path.join(srcDir, file);
  let html = fs.readFileSync(srcPath, 'utf8');

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const canonicalMatch = html.match(/<link rel="canonical" href="https:\/\/servemasteracademy\.ca\/blog\/([^"]+)"/i);

  if (!titleMatch) {
    console.warn(`  WARN: Missing title in ${file}`);
    return;
  }

  const rawTitle = titleMatch[1];
  const articleTitle = rawTitle
    .replace(/\s*[–—-]\s*ServeMaster Academy\s*$/, '')
    .replace(/\s*–\s*ServeMaster Academy\s*$/, '')
    .trim();

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
        "name": articleTitle,
        "item": frCanonical
      }
    ]
  };

  const schemaTag = `\n  <script type="application/ld+json">\n  ${JSON.stringify(schema, null, 2).replace(/\n/g, '\n  ')}\n  </script>`;

  html = html
    .replace('<html lang="en">', '<html lang="fr">')
    .replace(
      /<link rel="canonical" href="[^"]+"/,
      `<link rel="canonical" href="${frCanonical}"`
    )
    .replace(
      /<meta property="og:url" content="[^"]+"/,
      `<meta property="og:url" content="${frCanonical}"`
    )
    .replace(
      /data-i18n="nav_home">Home<\/a>/g,
      `data-i18n="nav_home">Accueil</a>`
    )
    .replace(
      /data-i18n="nav_features">Academy<\/a>/g,
      `data-i18n="nav_features">Académie</a>`
    )
    .replace(
      /data-i18n="nav_blog">Knowledge Centre<\/a>/g,
      `data-i18n="nav_blog">Centre de connaissances</a>`
    )
    .replace(
      /data-i18n="nav_roleplay">AI Role-Play<\/a>/g,
      `data-i18n="nav_roleplay">Jeu de rôle IA</a>`
    )
    .replace(
      /data-i18n="nav_pricing">Pricing<\/a>/g,
      `data-i18n="nav_pricing">Tarifs</a>`
    )
    .replace(
      /data-i18n="nav_scholarship">🎓 Scholarship<\/a>/g,
      `data-i18n="nav_scholarship">🎓 Bourse</a>`
    )
    .replace(
      /data-i18n="nav_about">About<\/a>/g,
      `data-i18n="nav_about">À propos</a>`
    )
    .replace(
      /data-i18n="nav_login">Log in<\/a>/g,
      `data-i18n="nav_login">Se connecter</a>`
    )
    .replace(
      /data-i18n="nav_cta">Get Started Free<\/a>/g,
      `data-i18n="nav_cta">Commencer gratuitement</a>`
    )
    .replace(
      /class="text-zinc-400 hover:text-white text-xs font-bold tracking-widest border border-zinc-700 hover:border-zinc-500 rounded-full px-3 py-1\.5 transition-all">EN<\/button>/,
      `class="text-zinc-400 hover:text-white text-xs font-bold tracking-widest border border-zinc-700 hover:border-zinc-500 rounded-full px-3 py-1.5 transition-all">FR</button>`
    )
    .replace(
      /data-i18n="blog_back">← Back to Knowledge Centre<\/a>/g,
      `data-i18n="blog_back">← Retour au Centre de connaissances</a>`
    )
    .replace(
      /<span data-i18n="blog_min_read">min read<\/span>/g,
      `<span data-i18n="blog_min_read">min de lecture</span>`
    )
    .replace(
      /data-i18n="blog_more">More from the blog<\/p>/g,
      `data-i18n="blog_more">Plus d'articles</p>`
    )
    .replace(
      /data-i18n="nav_cta">Get Started Free<\/a>\s*<\/div>\s*<div class="mt-16 border-t/g,
      `data-i18n="nav_cta">Commencer gratuitement</a>\n    </div>\n\n    <div class="mt-16 border-t`
    );

  html = html
    .replace(
      /href="\/privacy" class="hover:text-zinc-300 transition-colors">Privacy<\/a>/g,
      `href="/privacy" class="hover:text-zinc-300 transition-colors">Confidentialité</a>`
    )
    .replace(
      /href="\/terms" class="hover:text-zinc-300 transition-colors">Terms<\/a>/g,
      `href="/terms" class="hover:text-zinc-300 transition-colors">Conditions</a>`
    )
    .replace(
      /href="\/blog" class="hover:text-zinc-300 transition-colors">Knowledge Centre<\/a>/g,
      `href="/blog" class="hover:text-zinc-300 transition-colors">Centre de connaissances</a>`
    )
    .replace(
      /href="\/managers" class="hover:text-amber-400 transition-colors">For Managers<\/a>/g,
      `href="/managers" class="hover:text-amber-400 transition-colors">Pour les gérants</a>`
    );

  const enLink = `    <div class="flex items-center gap-4 mb-8 flex-wrap">
    <a href="/blog" class="text-amber-400 text-sm hover:underline">← Centre de connaissances</a>
    <span class="text-zinc-700">|</span>
    <a href="/blog/${slug}" class="text-zinc-500 text-sm hover:text-zinc-300 transition-colors">🇨🇦 Read in English</a>
  </div>`;

  html = html.replace(
    /(<main[^>]*>)\s*\n\s*<a href="\/blog"[^>]*data-i18n="blog_back"[^>]*>.*?<\/a>/,
    `$1\n\n${enLink}`
  );

  const langScript = `
<script>
  (function(){
    var saved = localStorage.getItem('sma-lang');
    if (!saved) { localStorage.setItem('sma-lang','fr'); }
  })();
  function toggleLangMenu(){document.getElementById('lang-menu').classList.toggle('hidden');}
  function setLang(l){localStorage.setItem('sma-lang',l);document.getElementById('lang-menu').classList.add('hidden');document.getElementById('lang-btn').textContent=l.toUpperCase();if(l==='en')window.location='/blog/${slug}';if(l==='es')window.location='/blog/es/${slug}';}
  document.addEventListener('click',function(e){var m=document.getElementById('lang-menu');if(!m.classList.contains('hidden')&&!e.target.closest('#lang-selector'))m.classList.add('hidden');});
</script>`;

  html = html
    .replace(/<script src="\/js\/lang\.js[^"]*"><\/script>/g, langScript)
    .replace('</head>', schemaTag + '\n</head>');

  fs.writeFileSync(destPath, html, 'utf8');
  created++;
  console.log(`  OK: ${file} → "${articleTitle}"`);
});

console.log(`\nDone. Created: ${created}, Skipped (already exist): ${skipped}, Total processed: ${files.length}`);
