---
name: Brand accent palette
description: The canonical ServeMaster accent colors, their roles, and where they're defined as tokens.
---

# Brand accent palette (single source of truth)

- **Coral `#FF5E3A`** (hover `#e8522e`) = PRIMARY. All CTAs / buttons / nav sign-up / theme-color.
- **Amber-gold `#fbbf24`** = EDITORIAL / book-&-reading accent. Novel reader (seek bars, active chapter), app "Craft" track, blog blockquotes/table headers, book-launch emails.
- **Teal `#0A4D68`** = secondary (hero gradients).
- **Green `#22C55E`** = success; the green "Save X%" savings badge on pricing is an intentional positive-money indicator, NOT drift.
- Pricing page uses **emerald** as the deliberate Team/Business tier theme (borders, checks, comparison columns) — intentional, left intact.

**Why coral is primary (not amber):** the site was built coral-primary (btn-primary, theme-color, and the amber→coral remap in tailwind-input.css all resolve to coral). The polish-audit *suggested* amber-primary but the user chose to keep coral primary + amber as the editorial accent (lowest risk). Do NOT flip to amber-primary without re-confirming.

**Amber shade:** unified on `#fbbf24` (amber-400). The old `#f59e0b` (amber-500, rgb 245,158,11) was drift and was globally replaced. If you see `#f59e0b` reappear, it's drift.

**Where tokens live (define once):**
- `tailwind.config.js` → `theme.extend.colors.brand` = `{ coral, 'coral-hover', amber, teal }` (utility classes `bg-brand-coral` etc.).
- `tailwind-input.css` `:root` → `--sma-coral / --sma-coral-hover / --sma-amber / --sma-teal / --sma-success`.
- `public/brand.html` palette section is the visual reference (Coral · primary, Amber Gold · editorial, Teal · secondary, + neutrals).
- **How to apply:** existing inline hex was NOT mass-rewritten to `var()` (too wide/risky across ~300 blog files); tokens are the source of truth for new work. The amber→coral `!important` remap in tailwind-input.css still means `bg-amber-400`/`bg-amber-300` render coral — remember to `npm run build:css` after class/CSS changes.
