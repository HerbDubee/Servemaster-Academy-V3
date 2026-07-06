# Module ↔ Scenario Integrity

The training SPA (`app.html`) renders each module's practice scenarios by resolving `modules[].scenarioIds` against `practiceScenarios` (id lookup) in `public/js/content.js`; `lib/tracks.js` `MODULE_SCENARIOS` mirrors the same mapping for server-side completion/gating. **Keep the two in lockstep.**

Verify with `node scripts/check-module-scenarios.js` (registered as the `module-scenarios` validation): it asserts every `scenarioId` resolves, each scenario's own `moduleId` points back to its owning module (on-topic), `MODULE_SCENARIOS` matches `scenarioIds` exactly, all trilingual fields (EN/FR/ES title/desc/scene) are present, and no scenario is orphaned or double-referenced. Run it after any module rename or scenario id change.

## Scenario-count distribution

Most modules carry exactly **5** practice scenarios. The deliberate exceptions:

- Modules **15** (Wine Pairing Under Time Pressure) and **16** (Allergens & Special Requests at Depth) each carry a **6th** on-topic scenario (the correctly re-homed cocktail/halal scenarios).
- Module **25** (Bar Service Integration) is a **9**-scenario bar/cocktail deep-dive — its lessons explicitly teach the cocktail list, so the four classic-cocktail craft scenarios (147 Old Fashioned, 148 Martini, 149 Daiquiri, 150 Negroni) were re-homed here out of module 28 to keep VIP training on-topic.

This is intentional depth, not clutter; keep it in mind before "balancing" counts.

## Advisory topic-drift pass (`checkTopicDrift`)

The same script runs an advisory pass that scans each scenario's title+description — in all three languages (EN, FR, and ES; `DOMAIN_LEXICON` carries per-language word lists and matching is accent-insensitive) — for a strong, concrete subject (wine, cocktails, spirits, beer, coffee/tea, allergens, payment, reservations) and **warns** — never fails, so it can't break the validation — on two patterns:

- **Island drift:** a single scenario reads as a subject (≥ its `SUBJECT_MIN_HITS` bar, default 2; `spirits` is high-signal at 1 since spirit names rarely appear off-topic — whisky/whiskey live in `spirits`, not `cocktail`, and plain `rye` is excluded to avoid rye-bread noise) that is absent from the module's title, lesson curriculum (same language), and every sibling scenario's naming.
- **Cluster drift:** a strict majority of ≥3 of a module's scenarios share one subject (per-scenario bar of just 1 hit — the count is the corroboration) that the module's title/lessons cover nowhere; this catches off-topic scenarios that mutually "support" each other as siblings, which the island check alone misses.

Each language is judged independently, so a copy edit that drifts only the FR or ES wording off-topic still surfaces (the warning names which language). It's deliberately conservative so drift surfaces without drowning in false positives.

## Reviewed false-positive allowlist

Human-reviewed island false positives are suppressed via the `REVIEWED_DRIFT_ALLOWLIST` in the script (keyed by scenario id + language + subject) — so a clean run prints e.g. `N topic-drift warning(s) (6 reviewed false positive(s) suppressed)` and any NEW drift stands out immediately. The suppressed cases (documented inline in the allowlist):

- Scenario 87 "The Mocktail Menu" (module 14 Basic Menu Navigation) is beverage-menu navigation sitting beside its coffee/tea siblings — the "cocktail" signal is just mocktail vocabulary.
- Scenario 126 "The Online Reservation Mixup" (module 20 Recovering from Service Errors) is one more service error to recover from beside wrong-order/spill/POS siblings — flagged only in ES because the Spanish copy repeats "reserva".
- Scenario 145 "The Batched Cocktail Service" (module 27 Speed Without Sacrificing Warmth) is a bar-speed scenario beside its Shake-vs-Stir/Free-Pour/Citrus-Prep cocktail siblings — flagged only in FR/ES because those sibling titles don't carry the literal "cocktail" lexicon word.

If any of these scenarios is ever re-themed onto a new subject, remove its allowlist entry so the heuristic re-checks it.

**Cluster drift is not allowlisted; a clean tree currently produces zero cluster warnings** (module 28 "High-Pressure VIP & Celebrity Service" previously flagged as a 4-of-5 cocktail cluster — its four cocktail scenarios were re-homed to module 25 and replaced with genuine VIP/celebrity scenarios 153–156). The checker exports its internals when `require`d (not run as CLI) for unit-testing the drift logic.
