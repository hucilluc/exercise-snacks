// Recommendation engine (App Specification v7 §12, Phase 1).
//
// Pure functions only: no React, no storage access. The engine builds the
// most coherent six-card week it can — a daily arrangement builder, not an
// optimiser. The one hard rule is that each active domain appears exactly
// once per day; context spread, variety, spacing and frequency are soft
// scoring goals, and the best approximation always wins over failing.
//
// Determinism: choices are seeded by date, so the same inputs always
// produce the same week. Nothing regenerates on reload.
//
// Phase 2 hook: generateWeek accepts reservedSlotsByDate so anchor
// activities (Qigong/Yoga) can claim domain slots before generation.

import { zoneForDomain } from "./data/bodyBright.js";

export const generatorVersion = 1;

// Contextual flow order for a day's six cards (spec §5).
const CONTEXT_FLOW = [
  "getting_up",
  "kitchen",
  "outdoors",
  "sitting_break",
  "sitting_break",
  "daytime",
];

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
// Days whose cardio slot should be a walk chosen by the engine rather than
// a fixed walkPlacement label. Sunday is deliberately flexible.
const FLEXIBLE_WALK_DAYS = new Set(["tue", "thu", "sat"]);

function weekdayKey(isoDate, offsetDays = 0) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return WEEKDAY_KEYS[new Date(y, m - 1, d + offsetDays).getDay()];
}

// Small deterministic hash → [0, 1). Used only to break scoring ties so
// equal candidates vary across days without any true randomness.
function seededJitter(...parts) {
  let h = 2166136261;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

// ── Cards ────────────────────────────────────────────────────────────────

export function buildCard(date, slotIndex, exercise, contextKey) {
  return {
    cardId: `${date}-slot-${slotIndex}`,
    slotIndex,
    domainPresented: exercise.domain,
    bodyBrightZonePresented: zoneForDomain(exercise.domain),
    exerciseId: exercise.id,
    exerciseNamePresented: exercise.name,
    contextPresented: contextKey,
    variantPresented:
      exercise.variantLevels.find(
        (variant) => variant.level === exercise.currentVariantLevel
      ) ?? null,
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

// ── History helpers ──────────────────────────────────────────────────────

// Count exercise appearances in saved days within lookbackDays before
// (and excluding) beforeDate. Reads observations straight from history;
// no separate bookkeeping is stored.
export function recentUseCounts(days, beforeDate, lookbackDays = 14) {
  const counts = {};
  const dates = Object.keys(days).filter((date) => date < beforeDate).sort();
  const recent = dates.slice(-lookbackDays);

  recent.forEach((date) => {
    days[date].cards.forEach((card) => {
      counts[card.exerciseId] = (counts[card.exerciseId] ?? 0) + 1;
    });
  });

  return counts;
}

function exerciseIdsOnDay(day) {
  return day ? day.cards.map((card) => card.exerciseId) : [];
}

// ── Candidate scoring ────────────────────────────────────────────────────

function scoreCandidate(exercise, targetContext, env) {
  let score = 0;

  if (exercise.contexts.includes(targetContext)) score += 6;

  const usedThisWeek = env.weekUse[exercise.id] ?? 0;
  if (exercise.weeklyTargetFrequency) {
    score += (exercise.weeklyTargetFrequency - usedThisWeek) * 1.5;
  } else {
    score -= usedThisWeek * 2;
  }

  if (exercise.avoidConsecutiveDays && env.yesterdayIds.has(exercise.id)) {
    score -= 8;
  }

  score -= (env.recentUse[exercise.id] ?? 0) * 0.4;

  // Strong enough to outweigh frequency boosts but not a perfect context
  // fit on its own, so Saturdays bend gentle without breaking the day.
  if (env.isSaturday && env.saturdayLightness && exercise.intensity === "gentle") {
    score += 4;
  }

  return score + seededJitter(env.date, exercise.id, targetContext) * 0.5;
}

function bestCandidate(pool, targetContext, env) {
  let best = null;
  let bestScore = -Infinity;

  pool.forEach((exercise) => {
    const score = scoreCandidate(exercise, targetContext, env);
    if (score > bestScore) {
      best = exercise;
      bestScore = score;
    }
  });

  return { exercise: best, score: bestScore };
}

// ── Walk selection ───────────────────────────────────────────────────────

function chooseWalk(walks, env) {
  // Balance the three labelled walk slots: least-used first (this week,
  // then recent history), seeded tie-break.
  let best = null;
  let bestKey = Infinity;

  walks.forEach((walk) => {
    const key =
      (env.weekUse[walk.id] ?? 0) * 100 +
      (env.yesterdayIds.has(walk.id) ? 50 : 0) +
      // Avoid the label that walkPlacement fixes for tomorrow.
      (env.tomorrowFixedWalkId === walk.id ? 50 : 0) +
      (env.recentUse[walk.id] ?? 0) * 10 +
      seededJitter(env.date, walk.id);
    if (key < bestKey) {
      best = walk;
      bestKey = key;
    }
  });

  return best;
}

// ── Day generation ───────────────────────────────────────────────────────

function generateDay({
  date,
  library,
  settings,
  weekUse,
  recentUse,
  yesterdayIds,
  reservedSlots = [],
}) {
  const wk = weekdayKey(date);
  const env = {
    date,
    weekUse,
    recentUse,
    yesterdayIds,
    isSaturday: wk === "sat",
    saturdayLightness: settings.saturdayLightness !== false,
    tomorrowFixedWalkId: settings.walkPlacement?.[weekdayKey(date, 1)] ?? null,
  };

  const activeDomains = settings.activeDomains;
  const active = library.filter(
    (exercise) =>
      exercise.status === "active" && activeDomains.includes(exercise.domain)
  );

  // slot assignments: index in CONTEXT_FLOW → { exercise }
  const slots = new Array(CONTEXT_FLOW.length).fill(null);
  const remainingDomains = new Set(activeDomains);

  function firstOpenSlotFor(exercise) {
    let fallback = -1;
    for (let i = 0; i < CONTEXT_FLOW.length; i++) {
      if (slots[i]) continue;
      if (exercise.contexts.includes(CONTEXT_FLOW[i])) return i;
      if (fallback === -1) fallback = i;
    }
    return fallback;
  }

  function place(exercise, slotIndex) {
    slots[slotIndex] = exercise;
    remainingDomains.delete(exercise.domain);
    weekUse[exercise.id] = (weekUse[exercise.id] ?? 0) + 1;
  }

  // 1. Reserved slots (Phase 2 anchors) claim their domains first.
  reservedSlots.forEach((reserved) => {
    const exercise = active.find((e) => e.id === reserved.exerciseId);
    if (!exercise || !remainingDomains.has(reserved.domain)) return;
    place(
      { ...exercise, domain: reserved.domain },
      firstOpenSlotFor(exercise)
    );
  });

  // 2. Cardio slot: fixed or flexible walk, except where already reserved.
  if (remainingDomains.has("cardio_circulation")) {
    const walks = active.filter((e) => e.walkLabel);
    const fixedWalkId = settings.walkPlacement?.[wk];
    let cardioExercise = null;

    if (fixedWalkId) {
      cardioExercise = active.find((e) => e.id === fixedWalkId) ?? null;
    }
    if (!cardioExercise && FLEXIBLE_WALK_DAYS.has(wk) && walks.length > 0) {
      cardioExercise = chooseWalk(walks, env);
    }
    if (!cardioExercise) {
      // Sunday (or no walks available): score the whole cardio pool.
      const pool = active.filter((e) => e.domain === "cardio_circulation");
      cardioExercise = bestCandidate(pool, "outdoors", env).exercise;
    }

    if (cardioExercise) {
      place(cardioExercise, firstOpenSlotFor(cardioExercise));
    } else {
      remainingDomains.delete("cardio_circulation");
    }
  }

  // 3. Fill the remaining slots in flow order, each taking the
  //    best-scoring remaining domain. Slot-major assignment keeps
  //    constrained slots (kitchen, getting up) from being stranded with a
  //    domain that cannot fit them, which a global best-pair search allows.
  for (let i = 0; i < CONTEXT_FLOW.length && remainingDomains.size > 0; i++) {
    if (slots[i]) continue;

    let best = null;
    remainingDomains.forEach((domain) => {
      const pool = active.filter((e) => e.domain === domain);
      if (pool.length === 0) return;
      const { exercise, score } = bestCandidate(pool, CONTEXT_FLOW[i], env);
      if (!best || score > best.score) {
        best = { exercise, score };
      }
    });

    if (best) {
      place(best.exercise, i);
    }
  }
  // Any domain still unplaced has no active exercises: skipped, not fatal.

  // 4. Build cards in flow order. contextPresented is the slot's target
  //    context when the exercise genuinely fits it, otherwise the
  //    exercise's own primary context (best-approximation rule).
  const cards = [];
  slots.forEach((exercise, i) => {
    if (!exercise) return;
    const target = CONTEXT_FLOW[i];
    const context = exercise.contexts.includes(target)
      ? target
      : exercise.contexts[0];
    cards.push(buildCard(date, cards.length + 1, exercise, context));
  });

  return {
    date,
    weekStart: null, // filled in by generateWeek
    locked: false,
    generatorVersion,
    cards,
  };
}

// ── Week generation ──────────────────────────────────────────────────────

// weekDates: seven ISO dates Mon–Sun.
// priorDays: full saved days map (for recency and Sunday→Monday spacing).
// fixedDays: { date: dayRecord } current-week days to preserve untouched.
// reservedSlotsByDate: { date: [{ domain, exerciseId, context }] } (Phase 2).
export function generateWeek({
  weekDates,
  library,
  settings,
  priorDays = {},
  fixedDays = {},
  reservedSlotsByDate = {},
}) {
  const weekStart = weekDates[0];
  const recentUse = recentUseCounts(priorDays, weekStart);

  // Seed week usage with whatever the preserved days already show.
  const weekUse = {};
  Object.values(fixedDays).forEach((day) => {
    exerciseIdsOnDay(day).forEach((id) => {
      weekUse[id] = (weekUse[id] ?? 0) + 1;
    });
  });

  const days = {};

  weekDates.forEach((date, index) => {
    if (fixedDays[date]) {
      days[date] = fixedDays[date];
      return;
    }

    const previousDate = index > 0 ? weekDates[index - 1] : null;
    const yesterday =
      (previousDate && days[previousDate]) ??
      priorDays[
        Object.keys(priorDays)
          .filter((d) => d < date)
          .sort()
          .pop()
      ];
    const yesterdayIds = new Set(exerciseIdsOnDay(yesterday));

    days[date] = {
      ...generateDay({
        date,
        library,
        settings,
        weekUse,
        recentUse,
        yesterdayIds,
        reservedSlots: reservedSlotsByDate[date] ?? [],
      }),
      weekStart,
    };
  });

  return days;
}

// ── Swap ─────────────────────────────────────────────────────────────────

// Ranked same-domain alternatives for a card (spec §8). One mechanism for
// every slot: walks, snacks and (in Phase 2) anchors alike. The domain is
// preserved so Body Bright scoring keeps one credit per domain per day.
export function swapAlternatives(card, dayCards, library, recentUse = {}) {
  const usedToday = new Set(
    dayCards
      .filter((other) => other.cardId !== card.cardId)
      .map((other) => other.exerciseId)
  );

  const currentExercise = library.find((e) => e.id === card.exerciseId);

  return library
    .filter(
      (exercise) =>
        exercise.status === "active" &&
        exercise.domain === card.domainPresented &&
        exercise.id !== card.exerciseId &&
        !usedToday.has(exercise.id)
    )
    .map((exercise) => {
      let rank = 0;
      if (exercise.contexts.includes(card.contextPresented)) rank += 4;
      if (currentExercise && exercise.intensity === currentExercise.intensity)
        rank += 2;
      rank -= (recentUse[exercise.id] ?? 0) * 0.5;
      // Bias against immediately swapping back to what was just swapped away.
      if (card.swap?.fromExerciseId === exercise.id) rank -= 3;
      return { exercise, rank };
    })
    .sort(
      (a, b) => b.rank - a.rank || a.exercise.id.localeCompare(b.exercise.id)
    )
    .map((entry) => entry.exercise);
}
