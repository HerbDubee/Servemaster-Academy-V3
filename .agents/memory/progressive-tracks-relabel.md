---
name: Progressive tracks relabel & marketing i18n
description: How the 3-track (Foundations/Craft/Mastery) module system is wired, and why marketing copy must change in lang.js not the HTML.
---

# Progressive Tracks relabel

The 30 modules are grouped into 3 progressive tracks — **Foundations** (free, 10),
**Craft** (paid, 12), **Mastery** (paid, 8).

- **Track membership is authoritative in `lib/tracks.js`** (moduleId arrays + gating rules).
  Do NOT redefine membership elsewhere. `routes/user.js` (`/api/user/access`, `/api/user/knowledge`)
  and `app.html` (`getTrackState`, `renderAll`) consume it.
- **Module titles live only in `public/js/content.js` → `modules` array** (`title`/`titleFr`/`titleEs`).
  That array is the single source of truth for the card/nav/cert titles. `lessonData` (keyed by
  module id) holds lesson bodies and does NOT carry a competing display title.

**The relabel was originally title-only**, but a follow-up content pass then rewrote each module's
`lessonData` (subtitle + 5 lesson bodies + 5-question embedded quiz, EN/FR/ES) to match its new
title and re-mapped `emoji` + `blogSlug` to fit. **Verified: all 30 modules' lessons AND quizzes
in `content.js` already teach their current title** — this is done, do NOT re-rewrite it.
**Why:** confirmed by full audit of `lessonData` (all 30 pass a structural + i18n + on-topic check).
Ignore any older note claiming lessons/quizzes were "left on their original topics" — that was
superseded by the rewrite pass. The DB `quizzes` table is a single standalone `wine-service`
curriculum quiz (consumed only by `training.html` / `app-training.html`), NOT per-module content
for the 30 renamed modules — do not confuse it with the in-app module quizzes in `lessonData`.

**`scenarioIds` HAVE since been repointed** so each module's practice roleplays fit its new
title (content-based rematch). Three sources must stay in lockstep: `content.js`
`modules[].scenarioIds`, each scenario's `moduleId` in `content.js` `practiceScenarios`, and
`lib/tracks.js` `MODULE_SCENARIOS`. There are now **156 scenarios** (not 150) — most modules carry
exactly 5, but by design modules 15/16 carry 6 and module 25 is a 9-scenario bar/cocktail deep-dive,
so "exactly 5 per module" is no longer an invariant. The training UI renders by array length, so
uneven counts are cosmetic. The old grouping comments in `practiceScenarios` are cosmetic/stale — do
not trust them; the `moduleId` field is authoritative.

# Marketing i18n (lang.js overrides HTML)

`public/js/lang.js` holds `en`/`fr`/`es` dictionaries applied via `[data-i18n]` / `[data-i18n-html]`
attributes on page load. **lang.js OVERRIDES the HTML fallback text**, so to change any marketing
string that has a `data-i18n` attribute you MUST edit the matching key in lang.js — editing the
HTML alone will not stick. Keep the HTML fallback in sync anyway for no-JS / missing-key cases.
FR is sometimes missing a key (e.g. `home_hero`), in which case it falls back to the HTML (English).
