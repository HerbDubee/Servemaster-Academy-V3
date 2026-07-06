# Progressive Tracks — Scenario Content Alignment (RESOLVED)

The "Progressive Tracks Overhaul" reorganized the 30 modules into three
progressive tracks (Foundations → Craft → Mastery) and **renamed every module**.
A follow-up content pass then **rewrote each module's lesson content to fit its new
title** and re-mapped supporting assets. A subsequent **scenario pass has now
re-aligned every module's roleplay practice scenarios with its current title.**
As of this pass:

- **Lessons + quizzes** (`public/js/content.js` → `lessonData`, keyed by module id):
  **rewritten to match the new titles.** Each module now teaches its current title.
- **`blogSlug` and `emoji`** (`public/js/content.js` → `modules` array): **re-mapped**
  to fit the new titles.
- **Roleplay scenarios** (`public/js/content.js` → `practiceScenarios`, linked via
  `scenarioIds` / `moduleId`): **repointed.** Rather than rewriting scenario prose in
  place, each on-topic scenario was re-mapped to the module it fits. This was done by
  updating `modules[].scenarioIds` and each scenario's `moduleId` in
  `public/js/content.js`, kept in **lockstep** with `MODULE_SCENARIOS` in
  `lib/tracks.js`. The misleading `// ── Module N: <title> ──` section comments in
  `practiceScenarios` were removed. Scenario `id`s are unchanged, so progress tracking
  is preserved. FR/ES scene text stays in sync with EN.

There is **no remaining content gap.** Every module's scenarios are now on-topic for
its current title.

- **Source of truth for titles:** `public/js/content.js` → `modules` array (`title`/`titleFr`/`titleEs`).
- **Track membership + scenario mapping:** `lib/tracks.js` (`TRACKS`, `MODULE_SCENARIOS`) — authoritative.
- **Lockstep invariant:** `modules[].scenarioIds` (content.js) and `MODULE_SCENARIOS`
  (tracks.js) must always list the same scenario ids per module; each scenario's
  `moduleId` must equal the module that lists it.

Legend: **MISMATCH** = scenarios clearly about a different topic than the current
title · **PARTIAL** = related but reframed · **OK** = scenarios fit.

## Foundations (free · 10 modules)

| id | Current title | Status |
|----|---------------|--------|
| 1 | The First 90 Seconds | OK |
| 2 | Reading the Table | OK |
| 6 | Wine Service Fundamentals | OK |
| 7 | Guest Psychology Basics | OK |
| 8 | Handling Simple Complaints | OK |
| 10 | Body Language & Presence | OK |
| 14 | Basic Menu Navigation | OK |
| 17 | Team Communication on the Floor | OK |
| 19 | Cleanliness & Standards | OK |
| 22 | Closing the Interaction | OK |

## Craft (paid · 12 modules)

| id | Current title | Status |
|----|---------------|--------|
| 3 | Managing the 45-Minute Delay | OK |
| 4 | Table-Side Wine Service Under Pressure | OK |
| 5 | The Subtle Art of the Upsell | OK |
| 9 | Difficult Guests: De-escalation | OK |
| 13 | Multi-Course Pacing | OK |
| 15 | Wine Pairing Under Time Pressure | OK |
| 16 | Allergens & Special Requests at Depth | OK |
| 18 | Reading Subtle Guest Cues | OK |
| 20 | Recovering from Service Errors | OK |
| 25 | Bar Service Integration | OK |
| 26 | Handling VIPs Gracefully | OK |
| 27 | Speed Without Sacrificing Warmth | OK |

## Mastery (paid · 8 modules)

| id | Current title | Status |
|----|---------------|--------|
| 11 | Private Dining Command | OK |
| 12 | When the Sommelier Is Wrong | OK |
| 21 | Mentoring the New Server | OK |
| 23 | Edge-Case Situations | OK |
| 24 | Leadership on the Floor | OK |
| 28 | High-Pressure VIP & Celebrity Service | OK |
| 29 | Reading and Shaping the Room | OK |
| 30 | Long-Term Guest Relationship Building | OK |

## Status

All modules are **OK**. The scenario alignment pass is complete: every module's
practice scenarios are on-topic for its current title, `modules[].scenarioIds` and
`lib/tracks.js` `MODULE_SCENARIOS` are in lockstep, and FR/ES stay in sync with EN.
