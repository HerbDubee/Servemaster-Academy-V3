---
name: Scenario topic-drift checker (check-module-scenarios.js)
description: How the advisory drift heuristic works and which standing warnings are known/intentional
---

`scripts/check-module-scenarios.js` has an advisory topic-drift pass (`checkTopicDrift`) that never changes the exit code. Two kinds of drift are flagged:

- **Island drift** (original): one scenario's naming (title+desc) strongly expresses a subject (>= its `minHitsFor` threshold) that is absent from the module title, lessons, and every sibling scenario.
- **Cluster drift** (added): the module as a whole — a subject expressed by a strict majority of >= 3 scenarios (per-scenario bar here is just 1 lexicon hit, because the *count* is the corroboration) that the module's title/lessons cover nowhere.

**Why cluster uses a 1-hit bar while island uses 2:** agreeing siblings cancel each other out in the island check, so a cluster of individually-weak but mutually-reinforcing off-topic scenarios slips through. The count (3+ and strict majority) supplies the signal instead of any one scenario's strength.

**`spirits` is high-signal (`SUBJECT_MIN_HITS.spirits = 1`):** spirit names (whisky, bourbon, scotch, tequila…) almost never appear off-topic, so a single hit flags a stranded spirit scenario. Plain `rye` is deliberately excluded (collides with rye bread). whisky/whiskey were moved out of the `cocktail` lexicon into `spirits`.

**How to apply:** the checker exports its internals when `require`d (not run as CLI) — `{ checkTopicDrift, DOMAIN_LEXICON, SUBJECT_MIN_HITS, domainHits }` — so you can unit-check drift logic without invoking the CLI.

**Reviewed false-positive allowlist:** `REVIEWED_DRIFT_ALLOWLIST` (keyed by scenarioId:lang:subject) suppresses human-reviewed island false positives. A clean tree prints "0 topic-drift warning(s) (N reviewed false positive(s) suppressed)" so any NEW drift stands out. If an allowlisted scenario is re-themed, remove its entry. (Total scenarios is now 156, not 150.)

**Module 28 cluster is RESOLVED:** the former "High-Pressure VIP & Celebrity Service" 4-of-5 cocktail cluster was fixed by re-homing the four cocktail scenarios (Old Fashioned/Martini/Daiquiri/Negroni) to module 25 "Bar Service Integration" (now a 9-scenario bar deep-dive) and adding genuine VIP scenarios 153–156. A clean tree currently produces **zero cluster warnings**; do not expect a standing module-28 warning.
