# Progressive Tracks — Remaining Scenario Mismatches

The "Progressive Tracks Overhaul" reorganized the 30 modules into three
progressive tracks (Foundations → Craft → Mastery) and **renamed every module**.
A follow-up content pass then **rewrote each module's lesson content to fit its new
title** and re-mapped supporting assets. As of that pass:

- **Lessons + quizzes** (`public/js/content.js` → `lessonData`, keyed by module id):
  **rewritten to match the new titles.** Each module now teaches its current title.
- **`blogSlug` and `emoji`** (`public/js/content.js` → `modules` array): **re-mapped**
  to fit the new titles.
- **Roleplay scenarios** (`public/js/content.js` → `practiceScenarios`, linked via
  `scenarioIds` / `moduleId`): **NOT rewritten.** Most modules still carry the
  scenarios from their pre-overhaul topic, so the roleplays under a renamed module
  frequently describe a different subject than the module's current title.

This doc tracks the **only remaining content gap: the roleplay scenarios.** A future
scenario pass should either rewrite each mismatched module's scenarios to fit the new
title, or re-map `scenarioIds` so on-topic scenarios land under the fitting title.

- **Source of truth for titles:** `public/js/content.js` → `modules` array (`title`/`titleFr`/`titleEs`).
- **Track membership:** `lib/tracks.js` (authoritative).
- The `// ── Module N: <title> ──` comments in `practiceScenarios` were updated to the
  new titles, but the scenario objects beneath them still describe the original topic.

Legend: **MISMATCH** = scenarios clearly about a different topic than the current
title · **PARTIAL** = related but reframed · **OK** = scenarios still fit.

## Foundations (free · 10 modules)

| id | Current title | Scenario topic (still pre-overhaul) | Status |
|----|---------------|-------------------------------------|--------|
| 1 | The First 90 Seconds | Service mindset & standards | PARTIAL |
| 2 | Reading the Table | Taking & handling orders | MISMATCH |
| 6 | Wine Service Fundamentals | Food service & pacing | MISMATCH |
| 7 | Guest Psychology Basics | Problem resolution & table maintenance | MISMATCH |
| 8 | Handling Simple Complaints | International & cultural dining etiquette | MISMATCH |
| 10 | Body Language & Presence | Closing the experience (check & farewell) | MISMATCH |
| 14 | Basic Menu Navigation | Coffee & non-alcoholic beverage service | MISMATCH |
| 17 | Team Communication on the Floor | Menu knowledge & ingredient confidence | MISMATCH |
| 19 | Cleanliness & Standards | Host skills: reservations & phone | MISMATCH |
| 22 | Closing the Interaction | Digital tools & modern restaurant tech | MISMATCH |

## Craft (paid · 12 modules)

| id | Current title | Scenario topic (still pre-overhaul) | Status |
|----|---------------|-------------------------------------|--------|
| 3 | Managing the 45-Minute Delay | Beverage recommendations (wine/cocktail) | MISMATCH |
| 4 | Table-Side Wine Service Under Pressure | Wine pairing & decanting | OK |
| 5 | The Subtle Art of the Upsell | Natural & effective upselling | OK |
| 9 | Difficult Guests: De-escalation | Special occasions | MISMATCH |
| 13 | Multi-Course Pacing | Spirits, cocktails & bar knowledge | MISMATCH |
| 15 | Wine Pairing Under Time Pressure | Allergens & dietary needs | MISMATCH |
| 16 | Allergens & Special Requests at Depth | Reading guests & emotional intelligence | MISMATCH |
| 18 | Reading Subtle Guest Cues | Managing the rush | PARTIAL |
| 20 | Recovering from Service Errors | Cheese, charcuterie & tableside specialities | MISMATCH |
| 25 | Bar Service Integration | Bar setup & mise en place | PARTIAL |
| 26 | Handling VIPs Gracefully | Essential bartending techniques | MISMATCH |
| 27 | Speed Without Sacrificing Warmth | Classic cocktails & drink building | MISMATCH |

## Mastery (paid · 8 modules)

| id | Current title | Scenario topic (still pre-overhaul) | Status |
|----|---------------|-------------------------------------|--------|
| 11 | Private Dining Command | Advanced wine regions | MISMATCH |
| 12 | When the Sommelier Is Wrong | Server leadership & career | MISMATCH |
| 21 | Mentoring the New Server | Sustainability & responsible hospitality | MISMATCH |
| 23 | Edge-Case Situations | Team culture & kitchen communication | MISMATCH |
| 24 | Leadership on the Floor | Wellness, resilience & long-term career | MISMATCH |
| 28 | High-Pressure VIP & Celebrity Service | Bar upselling & guest engagement | MISMATCH |
| 29 | Reading and Shaping the Room | Responsible service & difficult situations | MISMATCH |
| 30 | Long-Term Guest Relationship Building | Bar career & culture | MISMATCH |

## Follow-up recommendation

For each MISMATCH/PARTIAL module, a dedicated scenario pass should either:
1. Rewrite the linked `practiceScenarios` (scene, dialogue, debrief) to match the new
   title; or
2. Re-map `scenarioIds` in the `modules` array so existing on-topic scenarios land
   under the fitting title (larger change — affects progress tracking and completion).
