---
name: Progressive tracks & apprenticeship presentation
description: Where the 3-stage (Foundations/Craft/Mastery) system is authoritative, and why presentation/marketing/Knowledge-Centre framing must never be wired to gating.
---

# Single sources of truth (do not fork)

- **Track membership + gating: `lib/tracks.js`** (moduleId arrays + rules). Never redefine
  membership or access logic anywhere else — `routes/user.js` and `app.html` (`getTrackState`)
  consume it. Treat this as FROZEN for presentation work.
- **Module display titles: `public/js/content.js` → `modules[]`** (`title`/`titleFr`/`titleEs`).
  The only source for card/nav/cert titles. `lessonData` (keyed by module id) holds bodies, not
  a competing title.
- **Scenario mapping lockstep (3 sources):** `content.js` `modules[].scenarioIds`, each scenario's
  `moduleId` in `content.js` `practiceScenarios`, and `lib/tracks.js` `MODULE_SCENARIOS`. Verify
  with `node scripts/check-module-scenarios.js`. Per-module counts are uneven by design (most 5;
  15/16 carry 6; module 25 is a 9-scenario bar deep-dive) — "5 per module" is NOT an invariant.
  Old grouping comments in `practiceScenarios` are stale; the `moduleId` field is authoritative.

# Presentation is decoupled from gating

**Why:** the "Progressive Craft Apprenticeship" overhaul was explicitly presentation-only —
naming, subtitles, sequencing, marketing copy, and the Knowledge Centre were reframed while
`lib/tracks.js` membership/gating stayed frozen.

**How to apply:** learner-facing framing must mirror the 3 stages, never drive access.
- The public Knowledge Centre (`public/blog/index.html`) groups the existing `blogSections` into
  3 tiers via a `tier` field (`foundations`/`craft`/`mastery`) on each section — pure display, no
  auth. Do NOT create placeholder/mock articles to "fill" a tier (real articles already exist).
- Stage subtitles are reused verbatim across app + marketing + Knowledge Centre: Foundations "The
  Apprentice's First Shifts", Craft "Finding Your Range", Mastery "Owning the Room" (+ FR/ES).

# i18n parity gotcha

(lang.js override mechanics live in `i18n-lang-js.md`; "Centre" spelling in `brand-spelling-centre.md`.)
lang.js has a large pre-existing EN↔FR↔ES key asymmetry — missing keys silently fall back to
English, so when auditing parity check only the keys you added, not the whole corpus.
