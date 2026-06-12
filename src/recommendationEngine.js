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

import { domainLabels, zoneForDomain } from "./data/bodyBright.js";

export const generatorVersion = 2;

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
const WEEKDAY_FULL = {
  sun: "sunday",
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
};
// Days whose cardio slot should be a walk chosen by the engine rather than
// a fixed walkPlacement label. Sunday is deliberately flexible.
const FLEXIBLE_WALK_DAYS = new Set(["tue", "thu", "sat"]);

// Domains an anchor credits when settings still use the legacy plain-string
// form ("tuesday": "qigong"). New profiles store { exerciseId, domains }.
const ANCHOR_DEFAULT_DOMAINS = {
  qigong: ["mobility_recovery", "balance_stability", "core_posture"],
  yoga: ["mobility_recovery", "core_posture"],
};

export function normalizeAnchor(value) {
  if (!value) return null;
  if (typeof value === "string") {
    return {
      exerciseId: value,
      domains: ANCHOR_DEFAULT_DOMAINS[value] ?? [],
    };
  }
  return value;
}

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

export function buildCard(date, slotIndex, exercise, contextKey, displayName) {
  return {
    cardId: `${date}-slot-${slotIndex}`,
    slotIndex,
    domainPresented: exercise.domain,
    bodyBrightZonePresented: zoneForDomain(exercise.domain),
    exerciseId: exercise.id,
    exerciseNamePresented: displayName ?? exercise.name,
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

// Count recent "skip" outcomes per exercise — the signal behind the mild
// temporary down-ranking (spec §7). Same observation-reading approach as
// recentUseCounts: derived from saved days, nothing extra stored.
export function recentSkipCounts(days, beforeDate, lookbackDays = 14) {
  const counts = {};
  const dates = Object.keys(days).filter((date) => date < beforeDate).sort();
  const recent = dates.slice(-lookbackDays);

  recent.forEach((date) => {
    days[date].cards.forEach((card) => {
      if (card.state === "skip") {
        counts[card.exerciseId] = (counts[card.exerciseId] ?? 0) + 1;
      }
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

  // Mild temporary down-rank for recently skipped exercises: capped well
  // below a context fit (+6) so a skip nudges rather than exiles.
  score -= Math.min(env.recentSkips?.[exercise.id] ?? 0, 3) * 1.5;

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
  recentSkips,
  yesterdayIds,
  reservedSlots = [],
}) {
  const wk = weekdayKey(date);
  const env = {
    date,
    weekUse,
    recentUse,
    recentSkips,
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

  // 1. Reserved slots (anchors) claim their domains first. They do not
  //    compete for contextual-flow slots: they become "scheduled" cards
  //    appended after the flow (spec §13 — anchors are planned sessions).
  //    Each claimed domain gets its own card, named for what it credits,
  //    so a full session can light several zones marked one by one.
  const reservedPicks = [];
  reservedSlots.forEach((reserved) => {
    const exercise = active.find((e) => e.id === reserved.exerciseId);
    if (!exercise || !remainingDomains.has(reserved.domain)) return;
    remainingDomains.delete(reserved.domain);
    weekUse[exercise.id] = (weekUse[exercise.id] ?? 0) + 1;
    reservedPicks.push({
      exercise: { ...exercise, domain: reserved.domain },
      context: reserved.context ?? "scheduled",
      displayName: `${exercise.name} — ${domainLabels[reserved.domain]}`,
    });
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

  // 4. Build cards in flow order, then append the anchor cards at the end
  //    of the day. contextPresented is the slot's target context when the
  //    exercise genuinely fits it, otherwise the exercise's own primary
  //    context (best-approximation rule).
  const cards = [];
  slots.forEach((exercise, i) => {
    if (!exercise) return;
    const target = CONTEXT_FLOW[i];
    const context = exercise.contexts.includes(target)
      ? target
      : exercise.contexts[0];
    cards.push(buildCard(date, cards.length + 1, exercise, context));
  });

  reservedPicks.forEach((pick) => {
    cards.push(
      buildCard(date, cards.length + 1, pick.exercise, pick.context, pick.displayName)
    );
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
  const recentSkips = recentSkipCounts(priorDays, weekStart);

  // Anchor activities (settings.weeklyAnchors) reserve their domain slots,
  // merged with any explicitly passed reservations.
  function reservedFor(date) {
    const anchor = normalizeAnchor(
      settings.weeklyAnchors?.[WEEKDAY_FULL[weekdayKey(date)]]
    );
    const anchorSlots = anchor
      ? anchor.domains.map((domain) => ({
          domain,
          exerciseId: anchor.exerciseId,
          context: "scheduled",
        }))
      : [];
    return [...(reservedSlotsByDate[date] ?? []), ...anchorSlots];
  }

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
        recentSkips,
        yesterdayIds,
        reservedSlots: reservedFor(date),
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
export function swapAlternatives(
  card,
  dayCards,
  library,
  recentUse = {},
  recentSkips = {}
) {
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
      // Half-strength skip down-rank: skipped exercises drift down the
      // alternatives list without disappearing from it.
      rank -= Math.min(recentSkips[exercise.id] ?? 0, 3) * 0.75;
      // Bias against immediately swapping back to what was just swapped away.
      if (card.swap?.fromExerciseId === exercise.id) rank -= 3;
      return { exercise, rank };
    })
    .sort(
      (a, b) => b.rank - a.rank || a.exercise.id.localeCompare(b.exercise.id)
    )
    .map((entry) => entry.exercise);
}

// ── Cross-day moves ──────────────────────────────────────────────────────

function weekUseCounts(days, weekStart) {
  const counts = {};
  Object.values(days).forEach((day) => {
    if (day.weekStart !== weekStart) return;
    day.cards.forEach((card) => {
      counts[card.exerciseId] = (counts[card.exerciseId] ?? 0) + 1;
    });
  });
  return counts;
}

function previousDateISO(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const prev = new Date(y, m - 1, d - 1);
  const mm = String(prev.getMonth() + 1).padStart(2, "0");
  const dd = String(prev.getDate()).padStart(2, "0");
  return `${prev.getFullYear()}-${mm}-${dd}`;
}

// Choose a same-domain replacement for a vacated card, scored against the
// week as it currently stands. Shared by cross-day moves and the
// not-suitable sweep. Returns null when the domain has no other option.
function chooseBackfill(workingDays, date, vacatedCard, library, settings) {
  const weekStart = workingDays[date].weekStart;
  const recentUse = recentUseCounts(workingDays, weekStart);
  const recentSkips = recentSkipCounts(workingDays, weekStart);
  const wk = weekdayKey(date);

  const env = {
    date,
    weekUse: weekUseCounts(workingDays, weekStart),
    recentUse,
    recentSkips,
    yesterdayIds: new Set(exerciseIdsOnDay(workingDays[previousDateISO(date)])),
    isSaturday: wk === "sat",
    saturdayLightness: settings.saturdayLightness !== false,
    tomorrowFixedWalkId: settings.walkPlacement?.[weekdayKey(date, 1)] ?? null,
  };

  const usedOnDay = new Set(workingDays[date].cards.map((c) => c.exerciseId));
  const pool = library.filter(
    (e) =>
      e.status === "active" &&
      e.domain === vacatedCard.domainPresented &&
      e.id !== vacatedCard.exerciseId &&
      !usedOnDay.has(e.id)
  );

  const targetContext =
    vacatedCard.contextPresented === "scheduled"
      ? "daytime"
      : vacatedCard.contextPresented;
  const replacement = bestCandidate(pool, targetContext, env).exercise;
  if (!replacement) return null;

  const context = replacement.contexts.includes(targetContext)
    ? targetContext
    : replacement.contexts[0];

  return { replacement, context };
}

// Move a card — or, for scheduled anchors, the whole activity's cards as a
// unit — to another day in the same week. Domain is preserved on both ends:
// the moved card replaces the target day's same-domain card, and the
// vacated slots are backfilled deterministically by the engine. States do
// not transfer; provenance is recorded in each affected card's swap field.
export function moveCards(days, fromDate, cardId, toDate, library, settings) {
  const fromDay = days[fromDate];
  const toDay = days[toDate];
  if (!fromDay || !toDay || fromDay.locked || toDay.locked) return days;
  if (fromDate === toDate) return days;

  const card = fromDay.cards.find((c) => c.cardId === cardId);
  if (!card) return days;

  // Anchor cards (scheduled, same activity) travel together.
  const unit =
    card.contextPresented === "scheduled"
      ? fromDay.cards.filter(
          (c) =>
            c.exerciseId === card.exerciseId &&
            c.contextPresented === "scheduled"
        )
      : [card];

  const movedDomains = new Set(unit.map((c) => c.domainPresented));
  const swappedAt = new Date().toISOString();

  // 1. Place the moving cards into the target day, replacing the cards of
  //    the same domains.
  const newToCards = toDay.cards.map((target) => {
    if (!movedDomains.has(target.domainPresented)) return target;
    const moving = unit.find(
      (c) => c.domainPresented === target.domainPresented
    );
    return {
      ...moving,
      cardId: target.cardId,
      slotIndex: target.slotIndex,
      state: "not_started",
      note: "",
      swap: {
        wasSwapped: true,
        swappedAt,
        fromExerciseId: target.exerciseId,
        toExerciseId: moving.exerciseId,
        movedFrom: fromDate,
        displacedState: target.state,
      },
    };
  });

  // 2. Backfill the vacated slots, scoring against the week as it now
  //    stands so duplicates and over-used exercises are avoided.
  const working = {
    ...days,
    [toDate]: { ...toDay, cards: newToCards },
    [fromDate]: {
      ...fromDay,
      cards: fromDay.cards.filter((c) => !unit.includes(c)),
    },
  };

  const newFromCards = fromDay.cards.map((vacated) => {
    if (!unit.includes(vacated)) return vacated;

    const chosen = chooseBackfill(working, fromDate, vacated, library, settings);
    // A move must leave the day complete: if the domain has no other
    // option, the moved exercise also stays in its source slot.
    const replacement =
      chosen?.replacement ?? library.find((e) => e.id === vacated.exerciseId);
    const context =
      chosen?.context ??
      (replacement.contexts.includes(vacated.contextPresented)
        ? vacated.contextPresented
        : replacement.contexts[0]);

    const backfill = {
      ...buildCard(fromDate, vacated.slotIndex, replacement, context),
      cardId: vacated.cardId,
      slotIndex: vacated.slotIndex,
      swap: {
        wasSwapped: true,
        swappedAt,
        fromExerciseId: vacated.exerciseId,
        toExerciseId: replacement.id,
        movedTo: toDate,
      },
    };

    working[fromDate] = {
      ...working[fromDate],
      cards: [...working[fromDate].cards, backfill],
    };
    return backfill;
  });

  return {
    ...days,
    [fromDate]: { ...fromDay, cards: newFromCards },
    [toDate]: { ...toDay, cards: newToCards },
  };
}

// ── Suitability (spec §7) ────────────────────────────────────────────────

// Mark a card not suitable: the card keeps its place with state
// "not_suitable", the exercise's library status flips to "needs_review"
// (dropping it from future generation and swap), and untouched copies of
// the exercise on today/future days of the same week are backfilled with
// alternatives. Past days and anything the user has acted on stay as they
// are. Returns { days, library }.
export function markNotSuitable(
  days,
  library,
  date,
  cardId,
  settings,
  todayISO
) {
  const day = days[date];
  const card = day?.cards.find((c) => c.cardId === cardId);
  if (!day || day.locked || !card) return { days, library };

  const exerciseId = card.exerciseId;
  const swappedAt = new Date().toISOString();

  const newLibrary = library.map((exercise) =>
    exercise.id === exerciseId && exercise.status === "active"
      ? { ...exercise, status: "needs_review" }
      : exercise
  );

  const working = {
    ...days,
    [date]: {
      ...day,
      cards: day.cards.map((c) =>
        c.cardId === cardId ? { ...c, state: "not_suitable" } : c
      ),
    },
  };

  // Sweep: replace untouched copies on today and future unlocked days of
  // the same week, in date order so each backfill sees the previous ones.
  const sweepDates = Object.keys(working)
    .filter(
      (d) =>
        d >= todayISO &&
        d !== date &&
        working[d].weekStart === day.weekStart &&
        !working[d].locked
    )
    .sort();

  sweepDates.forEach((sweepDate) => {
    const sweepDay = working[sweepDate];
    const targets = sweepDay.cards.filter(
      (c) =>
        c.exerciseId === exerciseId && c.state === "not_started" && !c.note
    );

    targets.forEach((target) => {
      const chosen = chooseBackfill(
        working,
        sweepDate,
        target,
        newLibrary,
        settings
      );
      if (!chosen) return; // no alternative in this domain: leave the card

      const backfill = {
        ...buildCard(sweepDate, target.slotIndex, chosen.replacement, chosen.context),
        cardId: target.cardId,
        slotIndex: target.slotIndex,
        swap: {
          wasSwapped: true,
          swappedAt,
          fromExerciseId: target.exerciseId,
          toExerciseId: chosen.replacement.id,
          reason: "not_suitable",
        },
      };

      working[sweepDate] = {
        ...working[sweepDate],
        cards: working[sweepDate].cards.map((c) =>
          c.cardId === target.cardId ? backfill : c
        ),
      };
    });
  });

  return { days: working, library: newLibrary };
}

// Un-marking the card is the review path until a library screen or LLM
// import exists: needs_review returns to active. Retired stays retired.
export function restoreSuitability(library, exerciseId) {
  return library.map((exercise) =>
    exercise.id === exerciseId && exercise.status === "needs_review"
      ? { ...exercise, status: "active" }
      : exercise
  );
}
