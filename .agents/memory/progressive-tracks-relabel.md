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
`lessonData` (lessons + quizzes) to match its new title and re-mapped `emoji` + `blogSlug` to fit.
**The one thing NOT rewritten is the roleplay `practiceScenarios`** — they still describe each
module's pre-overhaul topic (e.g. module 6 "Wine Service Fundamentals" still has food-pacing
scenarios). The remaining scenario mismatches are tracked in
`docs/track-relabel-content-mismatches.md` — consult it before a scenario-rewrite pass.
**Why:** the rename + lesson rewrite are done; scenarios were left for a later pass.
**The relabel was title-only.** Lesson bodies, quizzes, `emoji`, and `blogSlug`
were intentionally left on their original topics, so most renamed modules still have lesson/quiz
content that does not match the new title. The full list is tracked in
`docs/track-relabel-content-mismatches.md` — consult it before a content-rewrite pass.
**Why:** the task scoped this as a repositioning, not a content rewrite.

**`scenarioIds` HAVE since been repointed** so each module's 5 practice roleplays fit its new
title (content-based rematch across all 150 scenarios). Three sources must stay in lockstep:
`content.js` `modules[].scenarioIds`, each scenario's `moduleId` in `content.js` `practiceScenarios`,
and `lib/tracks.js` `MODULE_SCENARIOS`. Invariant: scenarios 1–150 each used exactly once, exactly
5 per module. The old grouping comments in `practiceScenarios` are now cosmetic/stale — do not trust
them for grouping; the `moduleId` field is authoritative.

# Marketing i18n (lang.js overrides HTML)

`public/js/lang.js` holds `en`/`fr`/`es` dictionaries applied via `[data-i18n]` / `[data-i18n-html]`
attributes on page load. **lang.js OVERRIDES the HTML fallback text**, so to change any marketing
string that has a `data-i18n` attribute you MUST edit the matching key in lang.js — editing the
HTML alone will not stick. Keep the HTML fallback in sync anyway for no-JS / missing-key cases.
FR is sometimes missing a key (e.g. `home_hero`), in which case it falls back to the HTML (English).
