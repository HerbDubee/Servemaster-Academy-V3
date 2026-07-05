'use strict';

/**
 * Apprenticeship track model — the single source of truth (server-side) for
 * which of the 30 modules belong to each track, and for computing a learner's
 * progressive unlock state.
 *
 * Access model (confirmed):
 *   - Foundations = the free funnel: every authenticated learner (free or paid)
 *     gets all 10 Foundations modules.
 *   - Craft + Mastery + Knowledge Center = paid AND sequentially gated:
 *       Craft unlocks after Foundations is complete;
 *       Mastery unlocks after Craft is complete.
 *   - Knowledge Center references unlock by track *completion*:
 *       Foundations-level after Foundations, Craft-level after Craft,
 *       full access after Mastery.
 *   - Admins may assign a learner a track, which unlocks that track (and the
 *     ones before it) for a paid learner without requiring prior completion.
 *
 * A module is "complete" when its quiz is passed (>= TOPIC_QUIZ_PASS) AND at
 * least REQUIRED_SCENARIOS of its practice scenarios are done — mirroring the
 * client's isTopicComplete().
 */

const TOPIC_QUIZ_PASS = 75;
const REQUIRED_SCENARIOS = 3;

// order: 1 = first. free: no payment required. prereq: track that must be
// complete before this one unlocks (null = none).
const TRACKS = [
  {
    id: 'foundations',
    order: 1,
    free: true,
    prereq: null,
    moduleIds: [1, 2, 6, 7, 8, 10, 14, 17, 19, 22],
    knowledgeLevel: 'basic',
  },
  {
    id: 'craft',
    order: 2,
    free: false,
    prereq: 'foundations',
    moduleIds: [3, 4, 5, 9, 13, 15, 16, 18, 20, 25, 26, 27],
    knowledgeLevel: 'intermediate',
  },
  {
    id: 'mastery',
    order: 3,
    free: false,
    prereq: 'craft',
    moduleIds: [11, 12, 21, 23, 24, 28, 29, 30],
    knowledgeLevel: 'advanced',
  },
];

const TRACK_IDS = TRACKS.map((t) => t.id);

// moduleId -> practice scenario ids (kept in lockstep with public/js/content.js).
const MODULE_SCENARIOS = {
  1: [37, 38, 39, 40, 41], 2: [10, 42, 44, 9, 76], 3: [2, 31, 46, 47, 49],
  4: [11, 17, 50, 51, 52], 5: [54, 55, 56, 57, 58], 6: [59, 60, 61, 62, 63],
  7: [1, 4, 23, 48, 64], 8: [43, 65, 67, 68, 69], 9: [6, 14, 70, 71, 72],
  10: [7, 45, 73, 74, 75], 11: [25, 77, 78, 79, 80], 12: [81, 82, 83, 84, 85],
  13: [15, 86, 87, 88, 89], 14: [90, 91, 92, 93, 94], 15: [13, 22, 28, 66, 95],
  16: [18, 96, 97, 98, 99], 17: [100, 101, 102, 103, 104], 18: [12, 19, 53, 105, 106],
  19: [108, 109, 110, 111, 112], 20: [113, 114, 115, 116, 117], 21: [118, 119, 120, 121, 122],
  22: [123, 124, 125, 126, 127], 23: [128, 129, 130, 131, 132], 24: [133, 134, 135, 136, 137],
  25: [138, 139, 140, 141, 142], 26: [35, 143, 144, 145, 146], 27: [34, 147, 148, 149, 150],
  28: [3, 5, 8, 32, 107], 29: [16, 20, 21, 24, 33], 30: [26, 27, 29, 30, 36],
};

function trackById(id) {
  return TRACKS.find((t) => t.id === id) || null;
}

function trackForModule(moduleId) {
  return TRACKS.find((t) => t.moduleIds.includes(Number(moduleId))) || null;
}

// Map a practice scenario id back to the module it belongs to (null if unknown).
function moduleForScenario(scenarioId) {
  const sid = Number(scenarioId);
  for (const mid of Object.keys(MODULE_SCENARIOS)) {
    if (MODULE_SCENARIOS[mid].includes(sid)) return Number(mid);
  }
  return null;
}

// A module is complete when quiz passed + enough scenarios done.
function isModuleComplete(moduleId, quizScores, completedScenarioSet) {
  const score = quizScores[moduleId] != null ? Number(quizScores[moduleId]) : null;
  if (score == null || score < TOPIC_QUIZ_PASS) return false;
  const scenIds = MODULE_SCENARIOS[moduleId] || [];
  const done = scenIds.filter((sid) => completedScenarioSet.has(Number(sid))).length;
  return done >= REQUIRED_SCENARIOS;
}

function isTrackComplete(trackId, quizScores, completedScenarioSet) {
  const track = trackById(trackId);
  if (!track) return false;
  return track.moduleIds.every((id) => isModuleComplete(id, quizScores, completedScenarioSet));
}

/**
 * Compute the full access state for a learner.
 *
 * @param {object} opts
 * @param {boolean} opts.isPaid            - has an active paid plan / trial / invite
 * @param {object}  opts.quizScores        - map of moduleId -> best quiz score
 * @param {Set<number>} opts.completedScenarioSet - completed scenario ids
 * @param {string|null} opts.assignedTrack - admin-assigned track (optional override)
 * @returns {object} access state
 */
function computeAccess({ isPaid = false, quizScores = {}, completedScenarioSet = new Set(), assignedTrack = null } = {}) {
  const completion = {};
  TRACK_IDS.forEach((id) => { completion[id] = isTrackComplete(id, quizScores, completedScenarioSet); });

  const assignedRank = assignedTrack ? (trackById(assignedTrack)?.order || 0) : 0;

  const unlocked = {};
  unlocked.foundations = true; // always available to any authenticated learner
  unlocked.craft = isPaid && (completion.foundations || assignedRank >= 2);
  unlocked.mastery = isPaid && (completion.craft || assignedRank >= 3);

  const unlockedModuleIds = new Set();
  TRACKS.forEach((t) => { if (unlocked[t.id]) t.moduleIds.forEach((m) => unlockedModuleIds.add(m)); });

  // Knowledge Center reference levels unlock by *completion* (paid only).
  const unlockedLevels = {
    basic: isPaid && completion.foundations,
    intermediate: isPaid && completion.craft,
    advanced: isPaid && completion.mastery,
  };

  const tracks = TRACKS.map((t) => {
    const modsDone = t.moduleIds.filter((id) => isModuleComplete(id, quizScores, completedScenarioSet)).length;
    return {
      id: t.id,
      order: t.order,
      free: t.free,
      prereq: t.prereq,
      moduleIds: t.moduleIds,
      unlocked: !!unlocked[t.id],
      complete: !!completion[t.id],
      modulesComplete: modsDone,
      moduleCount: t.moduleIds.length,
      requiresPaid: !t.free,
    };
  });

  return {
    isPaid: !!isPaid,
    assignedTrack: assignedTrack || null,
    tracks,
    completion,
    unlockedModuleIds: [...unlockedModuleIds],
    unlockedLevels,
  };
}

module.exports = {
  TOPIC_QUIZ_PASS,
  REQUIRED_SCENARIOS,
  TRACKS,
  TRACK_IDS,
  MODULE_SCENARIOS,
  trackById,
  trackForModule,
  moduleForScenario,
  isModuleComplete,
  isTrackComplete,
  computeAccess,
};
