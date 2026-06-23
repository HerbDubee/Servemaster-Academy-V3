#!/usr/bin/env node
/**
 * scripts/sync-blog-mobile-nav.js
 *
 * Stamps the canonical mobile nav (#mobile-menu block) into every
 * EN, FR, and ES blog article page so they stay in sync with the
 * desktop nav on those pages.
 *
 * Run after any nav change:
 *   node scripts/sync-blog-mobile-nav.js
 *
 * The blog index pages (index.html, fr/index.html, es/index.html) have
 * their own canonical nav blocks (a slightly different link set — they
 * include a "For Managers" link) and are stamped too. article.html (the
 * generic template shell) is skipped.
 */

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Canonical mobile nav blocks
// Keep these in sync with the desktop nav in the article pages.
// ---------------------------------------------------------------------------

const EN_MOBILE_NAV = `  <div id="mobile-menu" class="hidden md:hidden border-t border-zinc-800 bg-zinc-950">
    <div class="flex flex-col px-4 py-2">
      <a href="/" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white" data-i18n="nav_home">Home</a>
      <a href="/features" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white" data-i18n="nav_features">Academy</a>
      <a href="/blog" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white" data-i18n="nav_blog">Knowledge Centre</a>
      <a href="/ai-roleplay" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white" data-i18n="nav_roleplay">Roleplay Training</a>
      <a href="/pricing" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white" data-i18n="nav_pricing">Pricing</a>
      <a href="/scholarship" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white" data-i18n="nav_scholarship">🎓 Scholarship</a>
      <a href="/about" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white" data-i18n="nav_about">About</a>
      <a href="/demo" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Book a Demo</a>
      <a href="/checklist" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Free Checklist</a>
      <a href="/login" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white" data-i18n="nav_login">Log in</a>
      <a href="/signup" class="my-3 font-bold px-5 py-3 rounded-2xl text-sm text-center" style="background-color:#FF5E3A;color:#fff;" data-i18n="nav_cta">Get Started Free</a>
    </div>
  </div>`;

const FR_MOBILE_NAV = `  <div id="mobile-menu" class="hidden md:hidden border-t border-zinc-800 bg-zinc-950">
    <div class="flex flex-col px-4 py-2">
      <a href="/" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Accueil</a>
      <a href="/features" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Académie</a>
      <a href="/blog" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Centre de connaissances</a>
      <a href="/ai-roleplay" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Jeu de rôle IA</a>
      <a href="/pricing" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Tarifs</a>
      <a href="/scholarship" class="py-4 border-b border-zinc-800 text-sm font-semibold hover:opacity-90" style="color:#7dd3fc;">🎓 Bourse</a>
      <a href="/about" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">À propos</a>
      <a href="/demo" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Réserver une démo</a>
      <a href="/checklist" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Liste de contrôle gratuite</a>
      <a href="/managers" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Pour les gestionnaires</a>
      <a href="/login" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Se connecter</a>
      <a href="/signup" class="my-3 font-bold px-5 py-3 rounded-2xl text-sm text-center" style="background-color:#FF5E3A;color:#fff;">Commencer gratuitement</a>
    </div>
  </div>`;

const ES_MOBILE_NAV = `  <div id="mobile-menu" class="hidden md:hidden border-t border-zinc-800 bg-zinc-950">
    <div class="flex flex-col px-4 py-2">
      <a href="/" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Inicio</a>
      <a href="/features" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Academia</a>
      <a href="/blog" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Centro de conocimiento</a>
      <a href="/ai-roleplay" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Juego de Rol IA</a>
      <a href="/pricing" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Precios</a>
      <a href="/scholarship" class="py-4 border-b border-zinc-800 text-sm font-semibold hover:opacity-90" style="color:#7dd3fc;">🎓 Beca</a>
      <a href="/about" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Acerca de</a>
      <a href="/demo" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Reservar una demo</a>
      <a href="/checklist" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Lista de verificación gratis</a>
      <a href="/managers" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Para gerentes</a>
      <a href="/login" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Iniciar sesión</a>
      <a href="/signup" class="my-3 font-bold px-5 py-3 rounded-2xl text-sm text-center" style="background-color:#FF5E3A;color:#fff;">Empieza gratis</a>
    </div>
  </div>`;

// ---------------------------------------------------------------------------
// Canonical mobile nav blocks for the blog INDEX pages.
// These differ from the article navs (they add a "For Managers" link) and
// are managed here too so they stay in sync when the desktop nav changes.
// ---------------------------------------------------------------------------

const EN_INDEX_MOBILE_NAV = `  <div id="mobile-menu" class="hidden md:hidden border-t border-zinc-800 bg-zinc-950">
    <div class="flex flex-col px-4 py-2">
      <a href="/" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white" data-i18n="nav_home">Home</a>
      <a href="/features" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white" data-i18n="nav_features">Academy</a>
      <a href="/blog" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white" data-i18n="nav_blog">Knowledge Centre</a>
      <a href="/ai-roleplay" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white" data-i18n="nav_roleplay">Roleplay Training</a>
      <a href="/pricing" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white" data-i18n="nav_pricing">Pricing</a>
      <a href="/scholarship" class="py-4 border-b border-zinc-800 text-sm font-semibold" style="color:#7dd3fc;" data-i18n="nav_scholarship">🎓 Scholarship</a>
      <a href="/about" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white" data-i18n="nav_about">About</a>
      <a href="/demo" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Book a Demo</a>
      <a href="/checklist" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Free Checklist</a>
      <a href="/managers" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">For Managers</a>
      <a href="/login" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white" data-i18n="nav_login">Log in</a>
      <a href="/signup" class="my-3 font-bold px-5 py-3 rounded-2xl text-sm text-center" style="background-color:#FF5E3A;color:#fff;" data-i18n="nav_cta">Get Started Free</a>
    </div>
  </div>`;

const FR_INDEX_MOBILE_NAV = `  <div id="mobile-menu" class="hidden md:hidden border-t border-zinc-800 bg-zinc-950">
    <div class="flex flex-col px-4 py-2">
      <a href="/" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Accueil</a>
      <a href="/features" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Académie</a>
      <a href="/blog" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Centre de connaissances</a>
      <a href="/ai-roleplay" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Jeu de rôle IA</a>
      <a href="/pricing" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Tarifs</a>
      <a href="/about" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">À propos</a>
      <a href="/demo" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Réserver une démo</a>
      <a href="/checklist" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Liste de contrôle gratuite</a>
      <a href="/managers" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Pour les gestionnaires</a>
      <a href="/scholarship" class="py-4 border-b border-zinc-800 text-sm font-semibold hover:opacity-90" style="color:#7dd3fc;">🎓 Bourse</a>
      <a href="/login" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Se connecter</a>
      <a href="/signup" class="my-3 font-bold px-5 py-3 rounded-2xl text-sm text-center" style="background-color:#FF5E3A;color:#fff;">Commencer gratuitement</a>
    </div>
  </div>`;

const ES_INDEX_MOBILE_NAV = `  <div id="mobile-menu" class="hidden md:hidden border-t border-zinc-800 bg-zinc-950">
    <div class="flex flex-col px-4 py-2">
      <a href="/" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Inicio</a>
      <a href="/features" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Academia</a>
      <a href="/blog" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Centro de conocimiento</a>
      <a href="/ai-roleplay" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Juego de Rol IA</a>
      <a href="/pricing" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Precios</a>
      <a href="/about" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Acerca de</a>
      <a href="/demo" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Reservar una demo</a>
      <a href="/checklist" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Lista de verificación gratis</a>
      <a href="/managers" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Para gerentes</a>
      <a href="/scholarship" class="py-4 border-b border-zinc-800 text-sm font-semibold hover:opacity-90" style="color:#7dd3fc;">🎓 Beca</a>
      <a href="/login" class="text-zinc-400 py-4 border-b border-zinc-800 text-sm font-medium hover:text-white">Iniciar sesión</a>
      <a href="/signup" class="my-3 font-bold px-5 py-3 rounded-2xl text-sm text-center" style="background-color:#FF5E3A;color:#fff;">Empieza gratis</a>
    </div>
  </div>`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Replace the #mobile-menu div in `html` with `canonicalBlock`.
 * The regex matches from <div id="mobile-menu"…> through its closing </div>
 * (the two-level nesting: outer wrapper + inner flex column).
 */
function replaceMobileMenu(html, canonicalBlock) {
  // Matches the entire mobile-menu div, however it was previously formatted.
  // Uses [\s\S]*? (non-greedy) and relies on the unique closing pattern.
  const pattern = /[ \t]*<div id="mobile-menu"[\s\S]*?<\/div>\s*<\/div>/;
  if (!pattern.test(html)) {
    return null; // no mobile menu found — skip file
  }
  return html.replace(pattern, canonicalBlock);
}

function processDir(dir, canonicalBlock, label, exclude = []) {
  const skipSet = new Set(['index.html', ...exclude]);
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.html') && !skipSet.has(f));

  let updated = 0;
  let skipped = 0;
  let unchanged = 0;

  for (const file of files) {
    const filePath = path.join(dir, file);
    const original = fs.readFileSync(filePath, 'utf8');
    const result   = replaceMobileMenu(original, canonicalBlock);

    if (result === null) {
      console.warn(`  [SKIP] ${label}/${file} — no #mobile-menu found`);
      skipped++;
      continue;
    }

    if (result === original) {
      unchanged++;
      continue;
    }

    fs.writeFileSync(filePath, result, 'utf8');
    updated++;
  }

  console.log(`${label}: ${updated} updated, ${unchanged} already correct, ${skipped} skipped`);
  return updated;
}

/**
 * Stamp the canonical nav into a single file (used for the index pages,
 * which are excluded from processDir but have their own canonical navs).
 */
function processFile(filePath, canonicalBlock, label) {
  const original = fs.readFileSync(filePath, 'utf8');
  const result   = replaceMobileMenu(original, canonicalBlock);

  if (result === null) {
    console.warn(`  [SKIP] ${label} — no #mobile-menu found`);
    console.log(`${label}: 0 updated, 0 already correct, 1 skipped`);
    return 0;
  }

  if (result === original) {
    console.log(`${label}: 0 updated, 1 already correct, 0 skipped`);
    return 0;
  }

  fs.writeFileSync(filePath, result, 'utf8');
  console.log(`${label}: 1 updated, 0 already correct, 0 skipped`);
  return 1;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const blogRoot = path.join(__dirname, '..', 'public', 'blog');

console.log('Syncing mobile nav in EN article pages…');
const enUpdated = processDir(blogRoot, EN_MOBILE_NAV, 'en', ['article.html']);

console.log('Syncing mobile nav in FR article pages…');
const frUpdated = processDir(path.join(blogRoot, 'fr'), FR_MOBILE_NAV, 'fr');

console.log('Syncing mobile nav in ES article pages…');
const esUpdated = processDir(path.join(blogRoot, 'es'), ES_MOBILE_NAV, 'es');

console.log('Syncing mobile nav in blog index pages…');
const enIndexUpdated = processFile(path.join(blogRoot, 'index.html'), EN_INDEX_MOBILE_NAV, 'en/index.html');
const frIndexUpdated = processFile(path.join(blogRoot, 'fr', 'index.html'), FR_INDEX_MOBILE_NAV, 'fr/index.html');
const esIndexUpdated = processFile(path.join(blogRoot, 'es', 'index.html'), ES_INDEX_MOBILE_NAV, 'es/index.html');

const totalUpdated = enUpdated + frUpdated + esUpdated +
  enIndexUpdated + frIndexUpdated + esIndexUpdated;

console.log(`\nDone — ${totalUpdated} files updated total.`);
