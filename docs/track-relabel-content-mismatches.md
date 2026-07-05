# Progressive Tracks Relabel — Content Mismatches

The "Progressive Tracks Overhaul" **relabelled and reorganized** the 30 modules into
three progressive tracks (Foundations → Craft → Mastery). Per the task spec, this was a
**title/positioning change only**: each module's underlying lesson content, quizzes,
`emoji`, `blogSlug`, and `scenarioIds` were intentionally left intact.

As a result, many renamed modules now carry a title that no longer matches the lesson
body, blog reference, emoji, or scenarios still attached to that module id. These are
tracked below so a future content pass can rewrite the lessons/quizzes/scenarios (or
re-map assets) to fit the new titles.

- **Source of truth for titles:** `public/js/content.js` → `modules` array (`title`/`titleFr`/`titleEs`).
- **Track membership:** `lib/tracks.js` (authoritative; unchanged by this task).
- Lesson bodies live in `public/js/content.js` → `lessonData` (keyed by module id); the
  `// ── Module N: <old name> ──` comments there still describe the *original* topic,
  which is accurate for the *content* but no longer matches the new module title.

Legend: **MISMATCH** = content clearly about a different topic · **PARTIAL** = related
but reframed · **OK** = content still fits.

## Foundations (free · 10 modules)

| id | New title | Old title / lesson topic | blogSlug | emoji | Status |
|----|-----------|--------------------------|----------|-------|--------|
| 1 | The First 90 Seconds | Foundations of Exceptional Service | decline-of-fine-dining | 🌟 | PARTIAL |
| 2 | Reading the Table | Seating, Menus & Taking Orders | hosting-seating-strategy | 📋 | MISMATCH |
| 6 | Wine Service Fundamentals | Food Service & Perfect Pacing | tray-technique | 🍽️ | MISMATCH |
| 7 | Guest Psychology Basics | Table Maintenance & Problem Resolution | crumbing-the-table | 🧼 | MISMATCH |
| 8 | Handling Simple Complaints | International Etiquette | cultural-generational-dining | 🌍 | MISMATCH |
| 10 | Body Language & Presence | Closing the Experience | farewell-mastery | 👋 | MISMATCH |
| 14 | Basic Menu Navigation | Coffee & Non-Alcoholic Beverage Service | coffee-non-alcoholic-beverages | ☕ | MISMATCH |
| 17 | Team Communication on the Floor | Menu Knowledge & Ingredient Confidence | describe-a-dish | 🌿 | MISMATCH |
| 19 | Cleanliness & Standards | Host Skills: Reservations, Phone & Greeting | mastering-the-greeting | 📞 | MISMATCH |
| 22 | Closing the Interaction | Digital Tools & Modern Restaurant Tech | pos-technology-servers | 💻 | MISMATCH |

## Craft (paid · 12 modules)

| id | New title | Old title / lesson topic | blogSlug | emoji | Status |
|----|-----------|--------------------------|----------|-------|--------|
| 3 | Managing the 45-Minute Delay | Beverage Mastery: Wine & Cocktail Service | wine-fundamentals-servers | 🍸 | MISMATCH |
| 4 | Table-Side Wine Service Under Pressure | Wine Pairing & Advanced Beverage Knowledge | wine-service-tips | 🥂 | PARTIAL |
| 5 | The Subtle Art of the Upsell | Natural & Effective Upselling | natural-upsell-language | 💰 | OK |
| 9 | Difficult Guests: De-escalation | Special Occasions Mastery | special-occasions | 🎂 | MISMATCH |
| 13 | Multi-Course Pacing | Spirits, Cocktails & Bar Knowledge | cocktail-food-pairing | 🥃 | MISMATCH |
| 15 | Wine Pairing Under Time Pressure | Allergens, Dietary Needs & Safe Service | allergen-dietary-guide | ⚠️ | MISMATCH |
| 16 | Allergens & Special Requests at Depth | Reading Guests & Emotional Intelligence | reading-big-tippers | 🧠 | MISMATCH |
| 18 | Reading Subtle Guest Cues | Managing the Rush | silent-service | ⚡ | PARTIAL |
| 20 | Recovering from Service Errors | Cheese, Charcuterie & Tableside Specialities | perfect-pairings-server | 🧀 | MISMATCH |
| 25 | Bar Service Integration | Bar Setup & Mise en Place | essential-bartending-techniques | 🧊 | PARTIAL |
| 26 | Handling VIPs Gracefully | Essential Bartending Techniques | pour-counts-free-pouring | 🍹 | MISMATCH |
| 27 | Speed Without Sacrificing Warmth | Classic Cocktails & Drink Building | ten-classic-cocktails | 🥃 | MISMATCH |

## Mastery (paid · 8 modules)

| id | New title | Old title / lesson topic | blogSlug | emoji | Status |
|----|-----------|--------------------------|----------|-------|--------|
| 11 | Private Dining Command | Advanced Wine Regions | wine-fundamentals-servers | 🌎 | MISMATCH |
| 12 | When the Sommelier Is Wrong | Server Leadership & Career | hospitality-resume | ⭐ | MISMATCH |
| 21 | Mentoring the New Server | Sustainability & Responsible Hospitality | smart-serve-proserve | 🌱 | MISMATCH |
| 23 | Edge-Case Situations | Team Culture & Kitchen Communication | pre-shift-meeting | 🤝 | MISMATCH |
| 24 | Leadership on the Floor | Wellness, Resilience & Long-Term Career | building-resilience-hospitality | 🌟 | MISMATCH |
| 28 | High-Pressure VIP & Celebrity Service | Bar Upselling & Guest Engagement | bartender-upsell-scripts | 💰 | MISMATCH |
| 29 | Reading and Shaping the Room | Responsible Service & Difficult Situations | handling-drunk-tables | 🚫 | MISMATCH |
| 30 | Long-Term Guest Relationship Building | Bar Career & Culture | bartender-to-bar-manager | 🌟 | MISMATCH |

## Follow-up recommendation

A dedicated content pass should, for each MISMATCH/PARTIAL module, either:
1. Rewrite `lessonData` lessons + quiz questions to match the new title, and re-map
   `blogSlug`, `emoji`, and `scenarioIds` accordingly; or
2. Re-map module ids to tracks in `lib/tracks.js` so the existing content lands under a
   fitting title (larger change — affects access gating and progress).
