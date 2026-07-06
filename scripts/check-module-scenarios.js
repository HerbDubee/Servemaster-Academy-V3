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
 * spirits, beer, coffee/tea, allergens, payment, reservations) and *warns* on two
 * kinds of drift:
 *   - Island drift: a single scenario reads as a subject that is absent from its
 *     module's title, lesson curriculum, and every sibling scenario.
 *   - Cluster drift: several scenarios in one module all read as the same subject,
 *     which dominates the module's scenario set yet is absent from the module's own
 *     title and lessons — so the scenarios mutually "support" each other as siblings
 *     and the island check alone would miss them.
 * "spirits" is treated as high-signal: a single distinctive spirit name (whisky,
 * bourbon, scotch…) is enough to flag it, since those words rarely appear off-topic.
 * These warnings never change the exit code (the heuristic is deliberately
 * conservative to keep false positives near zero); they just flag scenarios worth a
 * human re-read after a copy edit.
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
//
// Each subject carries a per-language word list (en/fr/es) because scenarios are
// trilingual (title/desc in EN + titleFr/descFr + titleEs/descEs), and a copy
// edit can drift one language's wording off-topic while the others stay put.
// Accents are stripped before matching (see domainHits), so lexicon words may be
// written with or without their diacritics.
const DOMAIN_LEXICON = {
  wine: {
    en: ['wine', 'wines', 'bottle', 'bottles', 'sommelier', 'vintage', 'barolo', 'champagne', 'sparkling', 'sake', 'corked', 'decant', 'decanting', 'decanter', 'biodynamic', 'port', 'cellar', 'riesling', 'pinot', 'cabernet', 'chardonnay', 'rioja'],
    fr: ['vin', 'vins', 'bouteille', 'bouteilles', 'sommelier', 'sommelière', 'millésime', 'barolo', 'champagne', 'mousseux', 'pétillant', 'saké', 'bouchonné', 'décanter', 'décantation', 'carafage', 'biodynamique', 'porto', 'cave', 'riesling', 'pinot', 'cabernet', 'chardonnay', 'rioja'],
    es: ['vino', 'vinos', 'botella', 'botellas', 'sommelier', 'añada', 'barolo', 'champán', 'espumoso', 'espumante', 'sake', 'decantar', 'decantación', 'decantador', 'biodinámico', 'oporto', 'bodega', 'riesling', 'pinot', 'cabernet', 'chardonnay', 'rioja'],
  },
  cocktail: {
    en: ['cocktail', 'cocktails', 'martini', 'negroni', 'daiquiri', 'fashioned', 'mocktail', 'bitters', 'gin', 'tonic', 'muddle', 'shaken', 'stirred', 'vermouth', 'aperitif'],
    fr: ['cocktail', 'cocktails', 'martini', 'negroni', 'daiquiri', 'mocktail', 'amers', 'gin', 'tonic', 'piler', 'secoué', 'remué', 'vermouth', 'apéritif'],
    es: ['cóctel', 'cócteles', 'coctel', 'cocteles', 'martini', 'negroni', 'daiquiri', 'mocktail', 'amargos', 'ginebra', 'tónica', 'macerar', 'agitado', 'removido', 'vermut', 'aperitivo'],
  },
  // Neat/spirit-forward drinks — distinct from cocktail because a single spirit
  // name (whisky, bourbon, scotch…) almost never appears outside a spirits
  // context, so this subject is treated as high-signal (see SUBJECT_MIN_HITS):
  // even one distinctive word is enough to flag a spirit scenario stranded in an
  // unrelated module (e.g. a whisky flight in a wine module). Plain "rye" is left
  // out on purpose — it collides with rye bread and would add allergen noise.
  spirits: {
    en: ['whisky', 'whiskey', 'bourbon', 'scotch', 'tequila', 'vodka', 'rum', 'cognac', 'brandy', 'mezcal', 'digestif'],
    fr: ['whisky', 'whiskey', 'bourbon', 'scotch', 'tequila', 'vodka', 'rhum', 'cognac', 'brandy', 'mezcal', 'digestif'],
    es: ['whisky', 'whiskey', 'bourbon', 'escocés', 'tequila', 'vodka', 'ron', 'coñac', 'brandy', 'mezcal', 'digestivo'],
  },
  beer: {
    en: ['beer', 'beers', 'pint', 'lager', 'ale', 'ipa', 'draught'],
    fr: ['bière', 'bières', 'pinte', 'lager', 'ale', 'ipa', 'pression'],
    es: ['cerveza', 'cervezas', 'pinta', 'lager', 'ale', 'ipa', 'barril'],
  },
  'coffee/tea': {
    en: ['coffee', 'espresso', 'cappuccino', 'latte', 'matcha'],
    fr: ['café', 'expresso', 'espresso', 'cappuccino', 'latte', 'matcha'],
    es: ['café', 'espresso', 'capuchino', 'cappuccino', 'latte', 'matcha'],
  },
  allergen: {
    en: ['allergy', 'allergies', 'allergen', 'allergens', 'allergic', 'celiac', 'coeliac', 'anaphylactic', 'anaphylaxis', 'gluten', 'vegan', 'dietary', 'kosher', 'halal', 'intolerance'],
    fr: ['allergie', 'allergies', 'allergène', 'allergènes', 'allergique', 'cœliaque', 'coeliaque', 'anaphylactique', 'anaphylaxie', 'gluten', 'végétalien', 'végane', 'casher', 'cachère', 'halal', 'intolérance'],
    es: ['alergia', 'alergias', 'alérgeno', 'alérgenos', 'alérgico', 'celíaco', 'celiaco', 'anafiláctico', 'anafilaxia', 'gluten', 'vegano', 'dietético', 'kosher', 'halal', 'intolerancia'],
  },
  payment: {
    en: ['bill', 'check', 'tip', 'tips', 'tipping', 'gratuity', 'splitting', 'pos', 'receipt'],
    fr: ['addition', 'pourboire', 'pourboires', 'gratification', 'reçu', 'ticket'],
    es: ['cuenta', 'propina', 'propinas', 'gratificación', 'recibo', 'ticket'],
  },
  reservation: {
    en: ['reservation', 'reservations', 'overbooking', 'overbooked'],
    fr: ['réservation', 'réservations', 'surréservation', 'surbooking'],
    es: ['reserva', 'reservas', 'sobreventa', 'sobrerreserva', 'overbooking'],
  },
};

// Per-subject minimum lexicon hits required before a scenario's *naming* counts
// as strongly expressing that subject. The default is 2 (a single generic word
// like "wine" or "bill" carries too little signal on its own). "spirits" is the
// exception: its words are proper spirit names that almost never appear outside a
// spirits context, so a single hit is enough to flag drift (e.g. a lone whisky
// scenario stranded in a wine module — blind spot #1). Keep this list tiny and
// only for subjects whose every word is unambiguous, or false positives creep in.
const SUBJECT_MIN_HITS = { spirits: 1 };
function minHitsFor(domain) {
  return SUBJECT_MIN_HITS[domain] || 2;
}

// The three languages each scenario carries, mapped to their content.js fields.
const LANGS = [
  { key: 'en', label: 'EN', title: 'title', desc: 'desc', subtitle: 'subtitle', body: 'body', q: 'q' },
  { key: 'fr', label: 'FR', title: 'titleFr', desc: 'descFr', subtitle: 'subtitleFr', body: 'bodyFr', q: 'qFr' },
  { key: 'es', label: 'ES', title: 'titleEs', desc: 'descEs', subtitle: 'subtitleEs', body: 'bodyEs', q: 'qEs' },
];

// Strip diacritics so "bière"/"allergène"/"añada" match their lexicon entries
// regardless of how accents were typed.
function stripDiacritics(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Count how many distinct lexicon words appear (as whole words) in a blob.
function domainHits(text, words) {
  const t = ' ' + stripDiacritics(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ') + ' ';
  let n = 0;
  for (const w of words) {
    const nw = stripDiacritics(w).toLowerCase();
    if (t.includes(' ' + nw + ' ')) n += 1;
  }
  return n;
}

// The module's own "theme text": its title plus its lesson curriculum. If a
// module's lessons already talk about a subject, a scenario on that subject is
// on-topic even when its four siblings happen not to mention it.
function moduleThemeText(mod, lessonData, lang) {
  const ld = (lessonData && lessonData[mod.id]) || {};
  let t = (mod[lang.title] || '') + ' ' + (ld[lang.subtitle] || '');
  for (const l of ld.lessons || []) t += ' ' + (l[lang.title] || '') + ' ' + (l[lang.body] || '');
  for (const q of ld.quiz || []) t += ' ' + (q[lang.q] || '');
  return t;
}

// Reviewed false-positive allowlist -----------------------------------------
//
// These (scenario id + language + subject) triples have been human-reviewed and
// confirmed on-topic — the topic-drift heuristic flags them only because of a
// keyword coincidence, not real drift. Suppressing them keeps the advisory
// output at "0 warnings" on a clean tree, so a genuinely NEW drift warning is
// impossible to miss in the noise.
//
// Each entry documents *why* it's a false positive. If a scenario listed here is
// ever re-themed (retitled/rewritten onto a different subject), REMOVE its entry
// so the heuristic can re-evaluate it — an allowlisted scenario is never checked.
//
// Key format: `${scenarioId}:${langKey}:${subject}` (langKey = en|fr|es).
const REVIEWED_DRIFT_ALLOWLIST = new Set([
  // Scenario 87 "The Mocktail Menu" (module 14 Basic Menu Navigation) is
  // beverage-menu navigation beside its coffee/tea siblings; the "cocktail"
  // signal is just mocktail vocabulary. On-topic in all three languages.
  '87:en:cocktail',
  '87:fr:cocktail',
  '87:es:cocktail',
  // Scenario 126 "The Online Reservation Mixup" (module 20 Recovering from
  // Service Errors) is one more service error to recover from, beside its
  // wrong-order/spill/POS siblings; flagged only in ES because the Spanish copy
  // repeats "reserva".
  '126:es:reservation',
  // Scenario 145 "The Batched Cocktail Service" (module 27 Speed Without
  // Sacrificing Warmth) is a bar-speed scenario beside its Shake-vs-Stir/
  // Free-Pour/Citrus-Prep cocktail siblings; flagged only in FR/ES because those
  // sibling titles don't carry the literal "cocktail" lexicon word.
  '145:fr:cocktail',
  '145:es:cocktail',
]);

// Conservative topic-drift detector. Warns when a scenario's *naming* (title +
// description — i.e. what the scenario is about, not incidental scene prose)
// strongly expresses one concrete subject (>= 2 distinct lexicon words) that is
// an island in its module: not in the module title, not in the module's lesson
// curriculum, and not shared by any sibling scenario. Reviewed false positives
// on REVIEWED_DRIFT_ALLOWLIST are suppressed. Returns { warnings, suppressed }.
function checkTopicDrift({ modules, practiceScenarios, lessonData }) {
  const warnings = [];
  let suppressed = 0;
  const modById = new Map(modules.map((m) => [Number(m.id), m]));

  const siblingsByModule = new Map();
  for (const s of practiceScenarios) {
    const m = Number(s.moduleId);
    if (!siblingsByModule.has(m)) siblingsByModule.set(m, []);
    siblingsByModule.get(m).push(s);
  }

  // Theme text is cached per (module, language) since it's the same for every
  // sibling scenario in a module.
  const themeCache = new Map();

  for (const s of practiceScenarios) {
    const modId = Number(s.moduleId);
    const mod = modById.get(modId);
    if (!mod) continue; // structural check already reports orphaned moduleIds

    // Judge each language independently so a drift in FR or ES wording surfaces
    // even when the EN naming (and vice versa) is still on-topic.
    for (const lang of LANGS) {
      // Dominant subject, judged from the naming fields only, in this language.
      const naming = `${s[lang.title] || ''} ${s[lang.desc] || ''}`;
      let domain = null;
      let best = 0;
      for (const [name, byLang] of Object.entries(DOMAIN_LEXICON)) {
        const h = domainHits(naming, byLang[lang.key]);
        if (h > best) {
          best = h;
          domain = name;
        }
      }
      if (!domain || best < minHitsFor(domain)) continue; // require a strong, concentrated signal

      const words = DOMAIN_LEXICON[domain][lang.key];

      // On-topic if the module's own title/curriculum covers the subject.
      const cacheKey = `${modId}:${lang.key}`;
      if (!themeCache.has(cacheKey)) themeCache.set(cacheKey, moduleThemeText(mod, lessonData, lang));
      if (domainHits(themeCache.get(cacheKey), words) > 0) continue;

      // On-topic if any sibling scenario is itself *named* around the same subject.
      // Judge siblings by their naming (title + description), the same standard used
      // for the candidate — an incidental one-off mention buried in scene prose does
      // not establish that the module "covers" the subject.
      const siblings = (siblingsByModule.get(modId) || []).filter((x) => x !== s);
      if (siblings.some((x) => domainHits(`${x[lang.title] || ''} ${x[lang.desc] || ''}`, words) > 0)) continue;

      // Suppress reviewed, confirmed-on-topic false positives so only NEW drift
      // reaches the output (see REVIEWED_DRIFT_ALLOWLIST).
      if (REVIEWED_DRIFT_ALLOWLIST.has(`${s.id}:${lang.key}:${domain}`)) {
        suppressed += 1;
        continue;
      }

      warnings.push(
        `Scenario ${s.id} ("${s.title}") reads as a "${domain}" scenario in its ${lang.label} wording, but module ${modId} ("${mod.title}") ` +
        `covers that subject nowhere else (not in its title, lessons, or sibling scenarios) — verify it is on-topic.`
      );
    }
  }

  // -- Cluster drift (blind spot #2) ---------------------------------------
  //
  // The per-scenario island check above intentionally goes quiet when siblings
  // agree with each other — a single off-topic scenario is suspicious, but a
  // whole coherent set is assumed intentional. That lets a *cluster* of drift
  // slip through: if several scenarios in one module all read as the same wrong
  // subject (e.g. four reservation scenarios crammed into a Cleanliness module),
  // they mutually "support" each other as siblings and none is ever flagged.
  //
  // This pass judges the module as a whole: it finds the subject that dominates
  // the module's scenario *naming* and warns when that dominant subject is
  // absent from the module's own title and lesson curriculum. Unlike the island
  // check, the per-scenario bar here is a single lexicon hit — the corroboration
  // comes from the *count* (a strict majority of at least 3 scenarios all naming
  // the same subject), not from any one scenario's strength. That is precisely
  // the pattern the island check misses, since the agreeing siblings cancel each
  // other out. A module with a naturally mixed scenario set has no single
  // dominant subject and never trips it, keeping false positives low.
  for (const [modId, scenarios] of siblingsByModule) {
    const mod = modById.get(modId);
    if (!mod) continue; // orphaned moduleIds already reported structurally
    const total = scenarios.length;
    if (total < 3) continue; // too few scenarios to call anything a "cluster"

    for (const lang of LANGS) {
      // Tally each scenario's single dominant naming subject in this language.
      // A single lexicon hit is enough to attribute a scenario to a subject here
      // (see the count-based corroboration note above).
      const counts = new Map();
      for (const s of scenarios) {
        const naming = `${s[lang.title] || ''} ${s[lang.desc] || ''}`;
        let domain = null;
        let best = 0;
        for (const [name, byLang] of Object.entries(DOMAIN_LEXICON)) {
          const h = domainHits(naming, byLang[lang.key]);
          if (h > best) {
            best = h;
            domain = name;
          }
        }
        if (domain && best >= 1) counts.set(domain, (counts.get(domain) || 0) + 1);
      }

      // The subject expressed by the most scenarios.
      let domSubject = null;
      let domCount = 0;
      for (const [name, c] of counts) {
        if (c > domCount) {
          domCount = c;
          domSubject = name;
        }
      }
      if (!domSubject) continue;
      // Must dominate decisively: at least 3 scenarios AND a strict majority.
      if (domCount < 3 || domCount * 2 <= total) continue;

      // On-topic if the module's own title/curriculum covers that subject.
      const cacheKey = `${modId}:${lang.key}`;
      if (!themeCache.has(cacheKey)) themeCache.set(cacheKey, moduleThemeText(mod, lessonData, lang));
      if (domainHits(themeCache.get(cacheKey), DOMAIN_LEXICON[domSubject][lang.key]) > 0) continue;

      warnings.push(
        `Module ${modId} ("${mod.title}") has ${domCount} of ${total} scenarios reading as "${domSubject}" in ${lang.label}, ` +
        `but the module's own title and lessons cover that subject nowhere — the scenario set may have drifted off-topic as a cluster.`
      );
    }
  }

  return { warnings, suppressed };
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
  // Reviewed false positives are suppressed via REVIEWED_DRIFT_ALLOWLIST so only
  // NEW drift surfaces.
  const { warnings: topicWarnings, suppressed } = checkTopicDrift({ modules, practiceScenarios, lessonData });
  const suppressedNote = suppressed ? ` (${suppressed} reviewed false positive(s) suppressed)` : '';
  if (topicWarnings.length) {
    console.warn(`${topicWarnings.length} topic-drift warning(s) (advisory — not a failure)${suppressedNote}:\n`);
    topicWarnings.forEach((w) => console.warn(`  ! ${w}`));
    console.warn('');
  } else {
    console.log(`0 topic-drift warnings${suppressedNote}.\n`);
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

if (require.main === module) {
  run();
} else {
  // Exposed for verification/tests; requiring the module does not run the CLI.
  module.exports = { checkTopicDrift, DOMAIN_LEXICON, SUBJECT_MIN_HITS, domainHits };
}
