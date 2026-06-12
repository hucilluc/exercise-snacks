// v4 capsule storage (Data Specification v4).
//
// The profile is a single portable JSON capsule: app state, settings, the
// exercise library, daily history, weekly snapshots, and the embedded LLM
// review guide/permissions that make exports self-explaining.
//
// Clean break from the v3 layout: a new storage key is used and old keys are
// ignored. Saved days use `days` → `cards` naming throughout.

import {
  bodyBright,
  contextLabels,
  emptyStateCounts,
  emptyZoneScores,
  scoreDays,
  zoneForDomain,
} from "./data/bodyBright";
import {
  currentDoseText,
  currentVariant,
  exerciseLibrary,
  findExerciseInLibrary,
  libraryVersion,
} from "./data/exerciseLibrary";

export const STORAGE_KEY = "bodyBrightProfile_v4";
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

function weekdayKey(isoDate) {
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
    parseISODate(isoDate).getDay()
  ];
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
      tuesday: "qigong",
      sunday: "yoga",
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

// ── Day building ─────────────────────────────────────────────────────────

export function buildCard(date, slotIndex, exercise, contextKey) {
  return {
    cardId: `${date}-slot-${slotIndex}`,
    slotIndex,
    domainPresented: exercise.domain,
    bodyBrightZonePresented: zoneForDomain(exercise.domain),
    exerciseId: exercise.id,
    exerciseNamePresented: exercise.name,
    contextPresented: contextKey,
    variantPresented: currentVariant(exercise),
    dosePresented:
      exercise.doseLevels.find(
        (dose) => dose.level === exercise.currentDoseLevel
      ) ?? null,
    state: "not_started",
    note: "",
    originalExerciseId: exercise.id,
    swap: null,
  };
}

// Interim day builder until the recommendation engine (Phase 1) replaces it.
// Fixed contextual-flow day; only the walk varies, following walkPlacement.
function buildDefaultDay(date, library, settings) {
  const walkId = settings.walkPlacement?.[weekdayKey(date)] ?? "walk_1";

  const slotPlan = [
    { exerciseId: "pelvic_tilts", context: "getting_up" },
    { exerciseId: "counter_pushups", context: "kitchen" },
    { exerciseId: walkId, context: "outdoors" },
    { exerciseId: "supported_one_leg_balance", context: "sitting_break" },
    { exerciseId: "neck_mobility", context: "sitting_break" },
    { exerciseId: "current_rehab", context: "daytime" },
  ];

  return {
    date,
    weekStart: toISODate(getMonday(parseISODate(date))),
    locked: false,
    cards: slotPlan
      .map((slot, index) => {
        const exercise = findExerciseInLibrary(library, slot.exerciseId);
        if (!exercise) return null;
        return buildCard(date, index + 1, exercise, slot.context);
      })
      .filter(Boolean),
  };
}

export function buildWeekDays(weekDates, library, settings) {
  return weekDates.reduce((acc, date) => {
    acc[date] = buildDefaultDay(date, library, settings);
    return acc;
  }, {});
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
    days: buildWeekDays(currentWeekDates, exerciseLibrary, settings),
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
  const days = { ...profile.days };
  const weeklySnapshots = { ...profile.weeklySnapshots };

  let cursor = parseISODate(profile.currentWeek.weekStart);
  const currentWeekStartDate = parseISODate(currentWeekStartISO);

  while (cursor < currentWeekStartDate) {
    const weekStartISO = toISODate(cursor);
    const weekDates = getWeekDates(cursor);
    const hasActivity = weekDates.some((date) =>
      days[date]?.cards.some((card) => card.state !== "not_started")
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

  const weekDefaults = buildWeekDays(
    currentWeekDates,
    profile.exerciseLibrary,
    profile.settings
  );

  currentWeekDates.forEach((date) => {
    days[date] = days[date] ?? weekDefaults[date];
    days[date] = { ...days[date], locked: false, weekStart: currentWeekStartISO };
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

  // Reseed the embedded library when the code-side library is newer.
  if ((profile.libraryVersion ?? 0) < libraryVersion) {
    profile = { ...profile, libraryVersion, exerciseLibrary };
  }

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

// ── Display helpers ──────────────────────────────────────────────────────

export function contextLabel(contextKey) {
  return contextLabels[contextKey] ?? contextKey;
}

export { currentDoseText };
