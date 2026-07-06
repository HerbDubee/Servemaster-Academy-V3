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
 * Usage:
 *   node scripts/check-module-scenarios.js
 *
 * Exit code:
 *   0  — every module resolves to on-topic, fully-translated scenarios
 *   1  — one or more mismatches found
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

function run() {
  const { modules, practiceScenarios } = loadContent();
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
