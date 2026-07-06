# ServeMaster Academy — Cohesion & Polish Audit

_Audit date: 2026-07-06. Read-only assessment. No code was changed to produce this list._

**Goal this serves:** a polished, cohesive website + app that feels aligned with the "First Crossings"/*Covers* book series in content, curriculum, and aesthetics.

Items are grouped by priority. Each has: **what**, **where**, **why it matters**, **suggested fix**, and a rough **effort** (S/M/L). Confidence is noted where a finding wasn't individually verified.

---

## P0 — Cohesion breakers & off-brand pages (do first)

### 1. Heading font is split across the site (Montserrat vs Playfair Display)
- **Where:** Playfair Display is used in `app.html`, `public/brand.html`, `public/forgot-password.html`, `public/reset-password.html`, `public/manager-dashboard.html`, and **every blog article** (EN/ES/FR). Several marketing pages (home, about, pricing) lead with Montserrat.
- **Why it matters:** This is the single biggest thing making the product feel like two different sites stitched together. A consistent heading typeface is the fastest lever for a "cohesive, high-quality" feel.
- **Fix:** Pick ONE heading font as the standard (recommend deciding based on the brand/novel aesthetic — Playfair reads more "literary/book," Montserrat more "modern app") and apply it everywhere. Because it's in ~250 files, do it via a shared font include + a repo-wide find/replace, not by hand.
- **Effort:** M (decision is quick; the sweep is mechanical but wide).

### 2. `public/training.html` is completely off-brand
- **Where:** `public/training.html` (served at `/training`, the public curriculum preview).
- **Why it matters:** It uses `https://cdn.tailwindcss.com` (runtime CDN, not the compiled CSS the rest of the site uses), a **light** theme (`bg-gray-50`, `bg-white`), and **blue-600** accents — a total departure from the dark-zinc + amber design language. A prospect previewing the curriculum sees a page that looks like a different product.
- **Fix:** Restyle to the dark/amber design language and switch off the Tailwind CDN, OR if it's a stale prototype, decide its fate (redirect to `/app/training` or the app).
- **Effort:** M.

### 3. Accent-color drift (amber-400 vs amber-500 vs coral) + hardcoded hex
- **Where:** `#fbbf24` (amber-400) is the intended accent, but `#f59e0b` (amber-500) appears in `app.html` (streak glow) and `pricing.html` inline styles; `#FF5E3A` (coral) is hardcoded inline across blog headers and nav CTAs; `pricing.html` also introduces `emerald-600` for the billing toggle.
- **Why it matters:** Small inconsistencies read as "unfinished" even when users can't name why.
- **Fix:** Define the accent palette once (amber primary, coral secondary — pick exact hexes), expose as Tailwind theme colors / CSS variables, and replace hardcoded inline hex with the tokens.
- **Effort:** M.

### 4. Post-curriculum "what's next" gap in the app
- **Where:** `app.html` dashboard — completing all 30 modules surfaces a "Download Certificate" banner and little else.
- **Why it matters:** This is the emotional peak of the training and the strongest natural moment to pull learners into the book series (and workbooks). Right now it dead-ends.
- **Fix:** Add a "What's next" moment: read *First Crossings*, try advanced/voice practice, explore the companion workbooks. Direct tie to book alignment.
- **Effort:** M.

### 5. Navigation siloing between the app and the novel reader
- **Where:** `app.html` has a "Books" link, but `public/novels-*.html` pages carry a different nav bar with no Dashboard/Learn/Practice links back to training.
- **Why it matters:** Users who cross into the novels get stranded (browser back is the only way home). Makes the reader feel bolted-on rather than part of one product.
- **Fix:** Give the novel pages a consistent header that links back into the app, and/or a shared nav component.
- **Effort:** M.

---

## P1 — Noticeable polish gaps

### 6. Missing SEO/meta on key pages
- **Where (verify each):** `public/app-training.html`, `public/training.html`, `public/manager-dashboard.html`, and the blog templates `public/blog/article.html` / `public/blog/index.html` are reported missing some of: `title`, `meta description`, `og:image`, `canonical`. Functional pages (`success`, `verify`, `unsubscribe`, `forgot/reset-password`) lack basic titles.
- **Why it matters:** Sharing/OG previews and search hygiene; also part of a "finished" feel.
- **Fix:** Add complete meta blocks; standardize an OG image per page type.
- **Effort:** S–M. _(Confidence: medium — confirm per file before editing.)_

### 7. Book ↔ curriculum cross-links are thematic, not concrete
- **Where:** Companion workbooks ($1.99) are promoted on the novel pages but never surfaced inside curriculum modules in `app.html`; Knowledge Center "field guides" map to tracks but don't reference the novel chapters that dramatize each skill.
- **Why it matters:** This is the core of "aligned with the book." Concrete links (e.g., "This scenario echoes Sofia's night in Ch. 2 → read it") deepen the product and create natural cross-sell.
- **Fix:** Add per-module/per-track references to relevant chapters + workbook prompts.
- **Effort:** M–L (content-heavy).

### 8. Dead / placeholder Instagram link on About
- **Where:** `public/about.html` line 181 — Kirk Adamson Instagram is `href="#"` (has `id="instagram-link"`; confirm whether JS is meant to populate it). A working `servemasteracademy` Instagram link exists lower on the same page.
- **Fix:** Point to the real profile or remove the dead icon.
- **Effort:** S.

### 9. "Knowledge Centre" vs "Knowledge Center" spelling
- **Where:** `public/features.html` (both spellings near each other). Check other pages + `lang.js`.
- **Fix:** Standardize on one (US "Center" matches the `.ca` brand's existing usage — confirm).
- **Effort:** S.

### 10. Missing / empty alt text on images
- **Where (reported, sample):** dashboard mockups/icons in `public/managers.html` and `public/teams.html`; the homepage logo lacks alt where the blog header logo has it.
- **Why it matters:** Accessibility + a "finished" signal.
- **Fix:** Add descriptive alt to meaningful images; `alt=""` only for purely decorative ones.
- **Effort:** S. _(Confidence: medium — verify per image.)_

### 11. Empty states & new-user experience in the app
- **Where:** `app.html` — achievements grid has no defined empty state for new users; the "Recommended for you" panel's `daysSince > 7` staleness logic can feel random/empty for brand-new users.
- **Fix:** Add friendly empty states and sensible defaults for day-0 users.
- **Effort:** S–M.

### 12. Onboarding: local-only progress isn't clearly flagged as at-risk
- **Where:** `app.html` onboarding ends with an optional "Create account to sync"; skippers keep progress only in localStorage with no clear "temporary / could be lost" warning.
- **Fix:** Make the tradeoff explicit at the skip point.
- **Effort:** S.

### 13. Internal links mix `.html` and clean URLs
- **Where:** Across pages — `href="/features.html"` vs `href="/features"`, and `/pricing#...` vs `/pricing.html#...`.
- **Why it matters:** Inconsistent routing/canonicalization; minor SEO + polish.
- **Fix:** Standardize on clean URLs site-wide.
- **Effort:** M. _(Confidence: medium.)_

---

## P2 — Low severity / nice-to-have

### 14. "Coming Soon" vs active links on Book 4
- **Where:** `public/novels-series.html` — "The Table We Built" shows a **Coming Soon** badge but its "Read & Listen" / workbook links are active (the target page exists). Either the badge or the active links is wrong.
- **Fix:** Decide the book's true status and make badge + links agree.
- **Effort:** S.

### 15. YouTube trailer placeholders
- **Where:** Novel pages have trailer embeds with empty `data-yt-id=""` → "coming soon" placeholder.
- **Fix:** Add real IDs or hide the section until ready.
- **Effort:** S.

### 16. Auth state can desync between app and novel pages
- **Where:** `app.html` uses `lib/auth.js`; novel pages use `js/nav-auth.js`. Logged-in state may not reflect on novel pages without a refresh.
- **Fix:** Share auth/session handling or re-check on load.
- **Effort:** M. _(Confidence: medium — verify behavior.)_

### 17. Fragmented support emails
- **Where:** `public/contact.html` lists `hello@`, `support@`, and `info@servemasteracademy.ca`.
- **Fix:** Consolidate to one primary support address.
- **Effort:** S.

### 18. Stray TODO markers in code
- **Where:** `lib/auth.js` (session/security TODOs), `scripts/record-difficult-guest.js` (audio TODOs).
- **Fix:** Resolve or convert to tracked follow-ups.
- **Effort:** varies.

### 19. Currency selector is text-only
- **Where:** `public/pricing.html` — the "USD" option just shows "Checkout is processed in CAD" rather than converting.
- **Fix:** Either remove the toggle or set clear expectations up front.
- **Effort:** S.

---

## Suggested sequencing
1. **Lock the design language** (items 1, 3) — one heading font + one accent palette applied site-wide. Everything else looks better on top of this.
2. **Fix the off-brand outlier** (item 2, `training.html`).
3. **Close the app↔book loop** (items 4, 5, 7) — the "what's next" moment, unified nav, and concrete book/curriculum cross-links. This is where "aligned with the book" is won.
4. **Hygiene pass** (items 6, 8–13) — SEO/meta, alt text, spelling, dead links, empty states, URL consistency.
5. **Low-severity cleanup** (14–19) as time allows.

## Notes on confidence
Items marked _(Confidence: medium)_ come from a broad sweep and should be confirmed per-file before editing. All P0 items were directly verified. Three findings from the initial sweep were checked and **dismissed** as false: a supposed `/novels/the-table-we-built` 404 (the page exists), a broken `Novel2.pdf` link (novels use graceful `n1–n4.pdf` existence checks), and "future-dated" legal pages (March 2026 is in the past as of this audit).
