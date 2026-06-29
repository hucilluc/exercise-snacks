// v4 capsule storage (Data Specification v4).
//
// The profile is a single portable JSON capsule: app state, settings, the
// exercise library, daily history, weekly snapshots, and the embedded LLM
// review guide/permissions that make exports self-explaining.
//
// Daily cards are produced by the recommendation engine. Generated days are
// stable: once written they are never regenerated, except for the one-time
// migration when generatorVersion increases, which only touches untouched
// days from today onwards.

import {
  bodyBright,
  contextLabels,
  emptyStateCounts,
  emptyZoneScores,
  scoreDays,
} from "./data/bodyBright.js";
import {
  exerciseLibrary,
  libraryVersion,
  mergeLibrary,
  normalizeLibrary,
} from "./data/exerciseLibrary.js";
import { generateWeek, generatorVersion } from "./recommendationEngine.js";

export const STORAGE_KEY = "bodyBrightProfile_v4";
export const BACKUP_KEY = "bodyBrightProfile_v4_backup";
export const SCHEMA_VERSION = 4;

export const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Date helpers ─────────────────────────────────────────────────────────

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseISODate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function getMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, amount) {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

export function getWeekDates(weekStartDate) {
  return dayNames.map((_, index) => toISODate(addDays(weekStartDate, index)));
}

export function getTodayIndex(weekDates) {
  const index = weekDates.indexOf(toISODate(new Date()));
  return index === -1 ? 0 : index;
}

// ── Default profile sections ─────────────────────────────────────────────

function defaultSettings() {
  return {
    activeDomains: [
      "cardio_circulation",
      "strength",
      "core_posture",
      "balance_stability",
      "mobility_recovery",
      "rehab",
    ],
    weeklyAnchors: {
      // Each anchor claims its listed domains: one card per domain, all
      // referring to the same scheduled activity.
      tuesday: {
        exerciseId: "qigong",
        domains: ["mobility_recovery", "balance_stability", "core_posture"],
      },
      sunday: {
        exerciseId: "yoga",
        domains: ["mobility_recovery", "core_posture"],
      },
    },
    saturdayLightness: true,
    walkPlacement: {
      mon: "walk_1",
      wed: "walk_2",
      fri: "walk_3",
    },
    weekStartsOn: "monday",
    weekRollover: "monday_00_00_local_time",
  };
}

function defaultLlmReviewGuide() {
  return {
    purpose:
      "Review Body Bright (Exercise Snack) app data. Assess consistency of use, suitability of exercises, repeated skips, not-suitable flags, balance across domains, and possible cautious progression.",
    routineReviewInstructions: [
      "Summarise the review period.",
      "Identify exercises completed reliably.",
      "Identify exercises repeatedly skipped, tried, or marked not suitable.",
      "Read card notes for context such as fatigue, breathlessness, or discomfort.",
      "Distinguish calibration from progression.",
      "For new or recently changed exercises, allow larger downward adjustment if the starting dose appears too ambitious.",
      "For established exercises, prefer cautious changes.",
      "Walk 1, Walk 2, and Walk 3 are labelled walking slots that may be differentiated over time (for example recovery, normal, progression) based on observed outcomes.",
      "Never remove an exercise's doseLevels, currentDoseLevel, variantLevels or currentVariantLevel fields; the app needs them. If a dose is set externally (for example a physiotherapist sets the Rehab dose), keep a placeholder doseLevels entry such as 'Current physio dose' rather than deleting the field.",
      "Do not increase dose and variant at the same time unless clearly justified.",
      "Flag issues that should be discussed with a physiotherapist or clinician.",
      "Do not rewrite locked historical records.",
      "Do not treat inactive weeks as failed exercise weeks; treat them as weeks where the app was not used or no activity was recorded.",
    ],
    expectedOutputs: [
      "Plain-English review",
      "Recommended changes",
      "Rationale for each change",
      "Importable JSON only if explicitly requested",
    ],
  };
}

function defaultLlmPermissions() {
  return {
    mayModify: [
      "exerciseLibrary.*.status",
      "exerciseLibrary.*.reviewMode",
      "exerciseLibrary.*.illustrationId",
      "exerciseLibrary.*.illustrationMode",
      "exerciseLibrary.*.currentVariantLevel",
      "exerciseLibrary.*.currentDoseLevel",
      "exerciseLibrary.*.variantLevels",
      "exerciseLibrary.*.doseLevels",
      "exerciseLibrary.*.contexts",
      "exerciseLibrary.*.functionalTags",
      "exerciseLibrary.*.careTags",
      "exerciseLibrary.*.intensity",
      "settings",
      "reviewState",
    ],
    mayAdd: [
      "exerciseLibrary.*",
      "new variant levels",
      "new dose levels",
      "new functional tags",
      "new care tags",
    ],
    mustNotModify: [
      "schemaVersion",
      "days from locked weeks",
      "weeklySnapshots from locked weeks",
      "bodyBright.domainToZone",
      "bodyBright.stateScores",
    ],
    mustNotDelete: [
      "exerciseLibrary",
      "days",
      "weeklySnapshots",
      "bodyBright",
      "settings",
      "reviewState",
    ],
    outputRules: [
      "When asked for an importable file, return valid JSON only.",
      "Do not rewrite historical records.",
      "Do not delete historical records.",
      "Do not remove required fields.",
      "Preserve unknown fields unless explicitly instructed otherwise.",
      "If uncertain whether a change should be applied, recommend it in prose rather than altering the JSON.",
    ],
  };
}

function defaultValidationRules() {
  return {
    requiredTopLevelSections: [
      "schemaVersion",
      "aboutThisProfile",
      "llmReviewGuide",
      "llmPermissions",
      "validationRules",
      "bodyBright",
      "settings",
      "exerciseLibrary",
      "currentWeek",
      "days",
      "weeklySnapshots",
      "reviewState",
    ],
    historyRules: {
      lockedWeeksAreReadOnly: true,
      currentWeekMayBeEditedByApp: true,
      llmShouldNotModifyDailyHistory: true,
      inactiveWeeksDoNotRequireDailyRecords: true,
    },
    bodyBrightRules: {
      domainToZoneIsCentralMapping: true,
      exerciseRecordsMustNotContainBodyBrightZone: true,
      historicalCardsMayStoreBodyBrightZonePresented: true,
    },
  };
}

// ── Snapshots and rollover ───────────────────────────────────────────────

function createWeeklySnapshot(weekStartISO, days, weekType = "active") {
  const weekDates = getWeekDates(parseISODate(weekStartISO));

  const scores =
    weekType === "inactive"
      ? {
          zoneScores: emptyZoneScores(),
          stateCounts: emptyStateCounts(),
          totalCreditedScore: 0,
        }
      : scoreDays(days, weekDates);

  return {
    weekStart: weekStartISO,
    weekEnd: weekDates[6],
    weekType,
    bodyBrightVersion: bodyBright.version,
    zoneScores: scores.zoneScores,
    stateCounts: scores.stateCounts,
    totalCreditedScore: scores.totalCreditedScore,
    createdAt: new Date().toISOString(),
    locked: true,
  };
}

function dayHasActivity(day) {
  return day.cards.some(
    (card) => card.state !== "not_started" || card.note || card.swap
  );
}

// Decide which current-week days must be preserved as-is. A day is kept
// when the user has touched it, when it is already in the past, or when it
// was produced by the current generator (stability rule).
function currentWeekFixedDays(days, currentWeekDates, todayISO) {
  const fixed = {};

  currentWeekDates.forEach((date) => {
    const day = days[date];
    if (!day) return;

    const keep =
      date < todayISO ||
      dayHasActivity(day) ||
      (day.generatorVersion ?? 0) >= generatorVersion;

    if (keep) {
      fixed[date] = day;
    }
  });

  return fixed;
}

export function createProfile(currentWeekDates) {
  const today = toISODate(new Date());
  const settings = defaultSettings();

  return {
    schemaVersion: SCHEMA_VERSION,
    aboutThisProfile: {
      profileName: "Body Bright profile",
      created: today,
      lastUpdated: today,
      schemaVersion: SCHEMA_VERSION,
    },
    llmReviewGuide: defaultLlmReviewGuide(),
    llmPermissions: defaultLlmPermissions(),
    validationRules: defaultValidationRules(),
    bodyBright,
    settings,
    libraryVersion,
    exerciseLibrary,
    currentWeek: {
      weekStart: currentWeekDates[0],
      weekEnd: currentWeekDates[6],
      selectedDate: currentWeekDates[getTodayIndex(currentWeekDates)],
      editable: true,
    },
    days: generateWeek({
      weekDates: currentWeekDates,
      library: exerciseLibrary,
      settings,
    }),
    weeklySnapshots: {},
    reviewState: {
      lastReviewedOn: null,
      reviewPeriodStart: today,
      reviewPeriodEnd: null,
    },
  };
}

function rolloverProfile(profile, currentWeekDates) {
  const currentWeekStartISO = currentWeekDates[0];
  const todayISO = toISODate(new Date());
  const days = { ...profile.days };
  const weeklySnapshots = { ...profile.weeklySnapshots };

  // Archive any whole weeks between the saved week and the current one.
  let cursor = parseISODate(profile.currentWeek.weekStart);
  const currentWeekStartDate = parseISODate(currentWeekStartISO);

  while (cursor < currentWeekStartDate) {
    const weekStartISO = toISODate(cursor);
    const weekDates = getWeekDates(cursor);
    const hasActivity = weekDates.some(
      (date) => days[date] && dayHasActivity(days[date])
    );

    if (!weeklySnapshots[weekStartISO]) {
      weeklySnapshots[weekStartISO] = createWeeklySnapshot(
        weekStartISO,
        days,
        hasActivity ? "active" : "inactive"
      );
    }

    weekDates.forEach((date) => {
      if (days[date]) {
        days[date] = { ...days[date], locked: true };
      }
    });

    cursor = addDays(cursor, 7);
  }

  // Fill the current week, preserving fixed days (see currentWeekFixedDays).
  const fixedDays = currentWeekFixedDays(days, currentWeekDates, todayISO);
  const priorDays = Object.fromEntries(
    Object.entries(days).filter(([date]) => date < currentWeekStartISO)
  );

  const weekDays = generateWeek({
    weekDates: currentWeekDates,
    library: profile.exerciseLibrary,
    settings: profile.settings,
    priorDays,
    fixedDays,
  });

  currentWeekDates.forEach((date) => {
    days[date] = {
      ...weekDays[date],
      locked: false,
      weekStart: currentWeekStartISO,
    };
  });

  const selectedDate = currentWeekDates.includes(
    profile.currentWeek.selectedDate
  )
    ? profile.currentWeek.selectedDate
    : currentWeekDates[getTodayIndex(currentWeekDates)];

  return {
    ...profile,
    currentWeek: {
      weekStart: currentWeekStartISO,
      weekEnd: currentWeekDates[6],
      selectedDate,
      editable: true,
    },
    days,
    weeklySnapshots,
  };
}

// ── Load / save ──────────────────────────────────────────────────────────

export function loadProfile(currentWeekDates) {
  let profile = null;

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.schemaVersion === SCHEMA_VERSION && parsed.days) {
        profile = parsed;
      }
    }
  } catch {
    profile = null;
  }

  if (!profile) {
    return createProfile(currentWeekDates);
  }

  // Reseed the embedded library when the code-side library is newer,
  // preserving user/LLM-owned guidance (status, dose/variant levels).
  if ((profile.libraryVersion ?? 0) < libraryVersion) {
    profile = {
      ...profile,
      libraryVersion,
      exerciseLibrary: mergeLibrary(exerciseLibrary, profile.exerciseLibrary),
    };
  }

  // Guarantee every exercise has the array fields the app iterates over, so
  // an imported profile can never crash generation or rendering.
  profile = {
    ...profile,
    exerciseLibrary: normalizeLibrary(profile.exerciseLibrary),
  };

  return rolloverProfile(profile, currentWeekDates);
}

export function saveProfile(profile) {
  const toSave = {
    ...profile,
    aboutThisProfile: {
      ...profile.aboutThisProfile,
      lastUpdated: new Date().toISOString(),
    },
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

// ── Export / import ──────────────────────────────────────────────────────

export function exportFilename() {
  return `body-bright-profile-${toISODate(new Date())}.json`;
}

export function exportProfileJSON(profile) {
  return JSON.stringify(
    {
      ...profile,
      aboutThisProfile: {
        ...profile.aboutThisProfile,
        lastUpdated: new Date().toISOString(),
      },
    },
    null,
    2
  );
}

// Apply a validated imported profile: stash the current profile under the
// one-deep backup key, write the import, then run the normal load pipeline
// so rollover/migration treat an old export exactly like reopening the app
// after time away.
export function applyImportedProfile(parsed, currentWeekDates) {
  const current = window.localStorage.getItem(STORAGE_KEY);
  if (current) {
    window.localStorage.setItem(BACKUP_KEY, current);
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  return loadProfile(currentWeekDates);
}

// ── Display helpers ──────────────────────────────────────────────────────

export function contextLabel(contextKey) {
  return contextLabels[contextKey] ?? contextKey;
}
