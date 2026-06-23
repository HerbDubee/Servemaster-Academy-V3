---
name: lang.js trilingual structure
description: How public/js/lang.js stores en/fr/es and the silent-merge failure mode when a block separator is missing
---

# public/js/lang.js — trilingual translation store

`window.T` is `{ en: {...}, fr: {...}, es: {...} }` (three sibling object literals in source order: en, then fr, then es). `LANGS = ['en','fr','es']`. `applyLang(lang)` does `var t = T[lang]; if (!t) return;` then sets `textContent`/`innerHTML`/`placeholder` on `[data-i18n*]` elements. `getCurrentLang()` reads localStorage `sma-lang`, defaulting to `'en'`, and runs on DOMContentLoaded.

## Silent-merge failure mode (the dangerous one)
If the `},\n\n    fr: {` separator between the en and fr blocks is missing, the French key/value pairs get absorbed into the `en:` object literal as **duplicate keys**. JS keeps the last value for duplicate keys, so:
- `T.en.<key>` resolves to the **French** value for every key that exists in both halves → the English site visibly renders French (subtitle, CTAs, etc.).
- `T.fr` is **undefined** → the French switcher silently does nothing (`if(!t) return`).

**Why:** this exact bug existed once — the English homepage rendered French text and French selection did nothing. Root cause was a single missing block-closing `},` + `fr: {` opener.

**How to apply / verify:** never trust line-region greps alone for this file. Evaluate it: load the IIFE source via `new Function('window','document','localStorage', src)` and assert `Object.keys(T)` is exactly `['en','fr','es']` and that `T.en.home_subtitle` is English (not French). A per-block duplicate-key scan should be clean (a couple of pre-existing `mgr_*` dups in fr/es are harmless). The server sends `Cache-Control: no-cache`, but the PWA service worker (`public/sw.js`) and the preview pane cache `js/lang.js` aggressively — after editing, verify via `curl localhost:5000/js/lang.js` + eval rather than the preview screenshot, which can show stale French.

## Conventions for adding keys
- Each language block is one flat object of `key: 'value'` (6-space indent). New keys for a language go inside that language's block.
- FR strings: use double-quoted values to avoid escaping the many apostrophes; testimonial quotes follow the existing `"\"…\""` (escaped double-quote) style, not guillemets.
- Hospitality term choices already in use: roleplay = "jeu de rôle", upsell = "vente incitative", Manager Dashboard = "tableau de bord Manager", Starter Team = "Équipe Démarreur", Pro Team = "Équipe Pro". ES uses "mesero/a", upsell = "venta sugerida", Manager Dashboard = "Panel del gerente".
