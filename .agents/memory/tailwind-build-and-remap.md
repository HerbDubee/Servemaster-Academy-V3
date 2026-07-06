---
name: Tailwind delivery + amber→coral remap
description: How CSS is compiled/served on this site and the amber-class palette hijack — read before restyling any page.
---

# Tailwind on ServeMaster

Two delivery mechanisms coexist:
- Marketing/public pages + app.html/admin.html load the **compiled** `public/tailwind.css`
  (built by `npm run build:css` = `tailwindcss -i tailwind-input.css -o public/tailwind.css --minify`).
  Config globs: `./public/**/*.html`, `./app.html`, `./admin.html`.
- `public/app-training.html` still uses the **runtime CDN** `https://cdn.tailwindcss.com`
  (so the CDN entry must stay in the server.js CSP allowlist).

**How to apply:** After editing any scanned HTML or introducing new utility classes,
run `npm run build:css` or the new classes silently won't exist in the served CSS.
The output is minified to a single line (so `rg -c` returns 1 regardless of match count;
verify classes by grepping the *escaped* form, e.g. `bg-green-500\/10`, `hover\:border-zinc-700`).

# amber-* classes are remapped to the brand palette
`tailwind-input.css` overrides amber utilities with `!important`:
`bg-amber-400`/`text-amber-400`/`border-amber-400` → coral `#FF5E3A`;
`bg-amber-900`/gradient amber → dark teal (`#0c2d3d`/`#0A4D68`).
**Why:** the site's real accent is coral applied through amber-named tokens — using an
`amber-400` class renders CORAL, not amber. Design language: body `#09090b`, Inter;
`.heading` = Playfair 900; `.btn-primary` = `#FF5E3A` (hover `#e8522e`); surfaces = zinc-900/zinc-950 + border-zinc-800.
