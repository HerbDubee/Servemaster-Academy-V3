---
name: i18n copy lives in lang.js
description: How visible marketing/site copy is rendered and where to change it
---
Marketing/site pages (home.html, features.html, etc.) render text via `data-i18n="key"` (and `data-i18n-html`) attributes. On page load a script reads `public/js/lang.js` (objects keyed by lang: en/fr/es) and replaces each element's text with the translation.

**Rule:** To change what a user actually sees, edit the value in `public/js/lang.js` for each language. The literal text between the HTML tags is only a fallback shown before the i18n script runs (and briefly on slow loads).

**Why:** Editing only the inline HTML text appears to "not work" — lang.js overwrites it on load. Missing keys in fr/es fall back to the en entry.

**How to apply:** When updating hero/section copy, update EN + FR + ES in lang.js. Update the inline fallback too if you want to avoid a flash of stale copy. lang.js is served (cacheable) — hard-refresh when verifying in a browser.
