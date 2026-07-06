#!/usr/bin/env node
/**
 * check-module-scenarios.js
 *
 * Verifies that every training module shows on-topic practice scenarios.
 *
 * The training SPA (app.html) renders a module's practice scenarios by resolving
 * `modules[].scenarioIds` against `practiceScenarios` (id lookup). `lib/tracks.js`
 * mirrors the same mapping in `MODULE_SCENARIOS` for server-side completion/gating.
 * A silent mismatch (a rename, an id reused, a MODULE_SCENARIOS drift) would make a
 * module display off-topic or missing scenarios without any runtime error.
 *
 * This check enforces, for all 30 modules:
 *   1. Every `scenarioId` a module references resolves to a real practiceScenarios entry.
 *   2. Each resolved scenario's own `moduleId` points back to that same module (on-topic).
 *   3. `MODULE_SCENARIOS` in lib/tracks.js matches modules[].scenarioIds exactly (lockstep).
 *   4. Every scenario carries its trilingual fields (title/desc/scene in EN/FR/ES).
 *   5. No scenario is referenced by more than one module, and none is orphaned.
 *
 * Those checks are all *structural* — they guarantee a scenario is wired to the
 * right module, but not that its *wording* still fits the module's subject. As a
 * softer safety net, a topic-drift heuristic (see checkTopicDrift below) scans each
 * scenario's title/description for a strong, concrete subject (wine, cocktails,
 * beer, coffee/tea, allergens, payment, reservations) and *warns* when that subject
 * is an "island" — absent from the module's own title, its lesson curriculum, and
 * every sibling scenario. These warnings never change the exit code (the heuristic
 * is deliberately conservative to keep false positives near zero); they just flag
 * scenarios worth a human re-read after a copy edit.
 *
 * Usage:
 *   node scripts/check-module-scenarios.js
 *
 * Exit code:
 *   0  — every module resolves to on-topic, fully-translated scenarios
 *        (topic-drift warnings, if any, do NOT affect the exit code)
 *   1  — one or more structural mismatches found
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { MODULE_SCENARIOS } = require('../lib/tracks');

const CONTENT_PATH = path.join(__dirname, '..', 'public', 'js', 'content.js');

// content.js is a browser IIFE that assigns to window.SMAContent. Evaluate it in a
// sandbox that provides a fake `window` so we can read the same data the app uses.
function loadContent() {
  const src = fs.readFileSync(CONTENT_PATH, 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'content.js' });
  if (!sandbox.window.SMAContent) {
    throw new Error('content.js did not populate window.SMAContent');
  }
  return sandbox.window.SMAContent;
}

const TRILINGUAL_FIELDS = [
  ['title', 'titleFr', 'titleEs'],
  ['desc', 'descFr', 'descEs'],
  ['scene', 'sceneFr', 'sceneEs'],
];

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => Number(v) === Number(b[i]));
}

// -- Topic-drift heuristic ---------------------------------------------------
//
// Concrete, high-signal subject lexicons. These are the kinds of nouns a copy
// edit carries with it when a scenario's theme changes — a wine scenario always
// says "wine/bottle/sommelier", a cocktail scenario says "cocktail/martini", and
// so on. Generic hospitality words (guest, table, service) are deliberately left
// out: they carry no topical signal and would only add noise. Only add a word
// here if a scenario that mentions it is almost certainly *about* that subject.
const DOMAIN_LEXICON = {
  wine: ['wine', 'wines', 'bottle', 'bottles', 'sommelier', 'vintage', 'barolo', 'champagne', 'sparkling', 'sake', 'corked', 'decant', 'decanting', 'decanter', 'biodynamic', 'port', 'cellar', 'riesling', 'pinot', 'cabernet', 'chardonnay', 'rioja'],
  cocktail: ['cocktail', 'cocktails', 'martini', 'negroni', 'daiquiri', 'fashioned', 'mocktail', 'bitters', 'gin', 'tonic', 'whisky', 'whiskey', 'muddle', 'shaken', 'stirred', 'vermouth', 'aperitif'],
  beer: ['beer', 'beers', 'pint', 'lager', 'ale', 'ipa', 'draught'],
  'coffee/tea': ['coffee', 'espresso', 'cappuccino', 'latte', 'matcha'],
  allergen: ['allergy', 'allergies', 'allergen', 'allergens', 'allergic', 'celiac', 'coeliac', 'anaphylactic', 'anaphylaxis', 'gluten', 'vegan', 'dietary', 'kosher', 'halal', 'intolerance'],
  payment: ['bill', 'check', 'tip', 'tips', 'tipping', 'gratuity', 'splitting', 'pos', 'receipt'],
  reservation: ['reservation', 'reservations', 'overbooking', 'overbooked'],
};

// Count how many distinct lexicon words appear (as whole words) in a blob.
function domainHits(text, words) {
  const t = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ') + ' ';
  let n = 0;
  for (const w of words) {
    if (t.includes(' ' + w + ' ')) n += 1;
  }
  return n;
}

// The module's own "theme text": its title plus its lesson curriculum. If a
// module's lessons already talk about a subject, a scenario on that subject is
// on-topic even when its four siblings happen not to mention it.
function moduleThemeText(mod, lessonData) {
  const ld = (lessonData && lessonData[mod.id]) || {};
  let t = (mod.title || '') + ' ' + (ld.subtitle || '');
  for (const l of ld.lessons || []) t += ' ' + (l.title || '') + ' ' + (l.body || '');
  for (const q of ld.quiz || []) t += ' ' + (q.q || '');
  return t;
}

// Conservative topic-drift detector. Warns when a scenario's *naming* (title +
// description — i.e. what the scenario is about, not incidental scene prose)
// strongly expresses one concrete subject (>= 2 distinct lexicon words) that is
// an island in its module: not in the module title, not in the module's lesson
// curriculum, and not shared by any sibling scenario. Returns warning strings.
function checkTopicDrift({ modules, practiceScenarios, lessonData }) {
  const warnings = [];
  const modById = new Map(modules.map((m) => [Number(m.id), m]));

  const siblingsByModule = new Map();
  for (const s of practiceScenarios) {
    const m = Number(s.moduleId);
    if (!siblingsByModule.has(m)) siblingsByModule.set(m, []);
    siblingsByModule.get(m).push(s);
  }

  const themeCache = new Map();

  for (const s of practiceScenarios) {
    const modId = Number(s.moduleId);
    const mod = modById.get(modId);
    if (!mod) continue; // structural check already reports orphaned moduleIds

    // Dominant subject, judged from the naming fields only.
    const naming = `${s.title} ${s.desc}`;
    let domain = null;
    let best = 0;
    for (const [name, words] of Object.entries(DOMAIN_LEXICON)) {
      const h = domainHits(naming, words);
      if (h > best) {
        best = h;
        domain = name;
      }
    }
    if (!domain || best < 2) continue; // require a strong, concentrated signal

    const words = DOMAIN_LEXICON[domain];

    // On-topic if the module's own title/curriculum covers the subject.
    if (!themeCache.has(modId)) themeCache.set(modId, moduleThemeText(mod, lessonData));
    if (domainHits(themeCache.get(modId), words) > 0) continue;

    // On-topic if any sibling scenario is itself *named* around the same subject.
    // Judge siblings by their naming (title + description), the same standard used
    // for the candidate — an incidental one-off mention buried in scene prose does
    // not establish that the module "covers" the subject.
    const siblings = (siblingsByModule.get(modId) || []).filter((x) => x !== s);
    if (siblings.some((x) => domainHits(`${x.title} ${x.desc}`, words) > 0)) continue;

    warnings.push(
      `Scenario ${s.id} ("${s.title}") reads as a "${domain}" scenario, but module ${modId} ("${mod.title}") ` +
      `covers that subject nowhere else (not in its title, lessons, or sibling scenarios) — verify it is on-topic.`
    );
  }

  return warnings;
}

function run() {
  const { modules, practiceScenarios, lessonData } = loadContent();
  const errors = [];

  if (!Array.isArray(modules) || !modules.length) {
    console.error('No modules parsed from content.js.');
    process.exit(1);
  }
  if (!Array.isArray(practiceScenarios) || !practiceScenarios.length) {
    console.error('No practiceScenarios parsed from content.js.');
    process.exit(1);
  }

  // Index scenarios by id (and flag duplicate ids up front).
  const scenarioById = new Map();
  for (const s of practiceScenarios) {
    if (scenarioById.has(s.id)) {
      errors.push(`Duplicate practiceScenarios id: ${s.id}`);
    }
    scenarioById.set(s.id, s);
  }

  // Track which module claims each scenario, to catch a scenario referenced twice.
  const claimedBy = new Map();

  for (const mod of modules) {
    const ids = mod.scenarioIds || [];

    if (!ids.length) {
      errors.push(`Module ${mod.id} ("${mod.title}") has no scenarioIds.`);
      continue;
    }

    for (const sid of ids) {
      const s = scenarioById.get(sid);

      // (1) resolves to a real scenario
      if (!s) {
        errors.push(`Module ${mod.id} ("${mod.title}") references scenarioId ${sid}, which has no practiceScenarios entry.`);
        continue;
      }

      // (2) scenario points back at this module (on-topic)
      if (Number(s.moduleId) !== Number(mod.id)) {
        errors.push(`Scenario ${sid} ("${s.title}") is listed under module ${mod.id} ("${mod.title}") but its moduleId is ${s.moduleId} — off-topic mismatch.`);
      }

      // (5a) not referenced by more than one module
      if (claimedBy.has(sid)) {
        errors.push(`Scenario ${sid} ("${s.title}") is referenced by both module ${claimedBy.get(sid)} and module ${mod.id}.`);
      } else {
        claimedBy.set(sid, mod.id);
      }

      // (4) trilingual completeness
      for (const [en, fr, es] of TRILINGUAL_FIELDS) {
        for (const field of [en, fr, es]) {
          if (!s[field] || String(s[field]).trim() === '') {
            errors.push(`Scenario ${sid} ("${s.title}") is missing field "${field}".`);
          }
        }
      }
    }

    // (3) lib/tracks.js lockstep
    const trackIds = MODULE_SCENARIOS[mod.id];
    if (!trackIds) {
      errors.push(`lib/tracks.js MODULE_SCENARIOS has no entry for module ${mod.id} ("${mod.title}").`);
    } else if (!arraysEqual(trackIds, ids)) {
      errors.push(`lib/tracks.js MODULE_SCENARIOS[${mod.id}] = [${trackIds.join(', ')}] does not match content.js scenarioIds [${ids.join(', ')}].`);
    }
  }

  // (5b) orphan scenarios — defined but never shown under any module
  for (const s of practiceScenarios) {
    if (!claimedBy.has(s.id)) {
      errors.push(`Scenario ${s.id} ("${s.title}") is defined but not referenced by any module's scenarioIds.`);
    }
  }

  // MODULE_SCENARIOS keys that don't correspond to a real module
  const moduleIds = new Set(modules.map((m) => Number(m.id)));
  for (const key of Object.keys(MODULE_SCENARIOS)) {
    if (!moduleIds.has(Number(key))) {
      errors.push(`lib/tracks.js MODULE_SCENARIOS has key ${key} with no matching module in content.js.`);
    }
  }

  console.log(`Checked ${modules.length} modules and ${practiceScenarios.length} practice scenarios.\n`);

  // Advisory topic-drift pass. Warns but never fails the check (see header).
  const topicWarnings = checkTopicDrift({ modules, practiceScenarios, lessonData });
  if (topicWarnings.length) {
    console.warn(`${topicWarnings.length} topic-drift warning(s) (advisory — not a failure):\n`);
    topicWarnings.forEach((w) => console.warn(`  ! ${w}`));
    console.warn('');
  }

  if (errors.length) {
    console.error(`${errors.length} problem(s) found:\n`);
    errors.forEach((e) => console.error(`  - ${e}`));
    console.error('');
    process.exit(1);
  }

  console.log('All modules resolve to on-topic, fully-translated practice scenarios, and lib/tracks.js is in lockstep.');
  process.exit(0);
}

run();
