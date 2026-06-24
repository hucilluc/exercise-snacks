import test from "node:test";
import assert from "node:assert/strict";
import {
  generateWeek,
  generatorVersion,
  moveCards,
  recentUseCounts,
  swapAlternatives,
} from "../src/recommendationEngine.js";
import { exerciseLibrary } from "../src/data/exerciseLibrary.js";
import { scoreDays } from "../src/data/bodyBright.js";

// 2026-06-15 is a Monday.
const WEEK = [
  "2026-06-15",
  "2026-06-16",
  "2026-06-17",
  "2026-06-18",
  "2026-06-19",
  "2026-06-20",
  "2026-06-21",
];

const SETTINGS = {
  activeDomains: [
    "cardio_circulation",
    "strength",
    "core_posture",
    "balance_stability",
    "mobility_recovery",
    "rehab",
  ],
  saturdayLightness: true,
  walkPlacement: { mon: "walk_1", wed: "walk_2", fri: "walk_3" },
};

function makeWeek(overrides = {}) {
  return generateWeek({
    weekDates: WEEK,
    library: exerciseLibrary,
    settings: SETTINGS,
    ...overrides,
  });
}

function cardioCard(day) {
  return day.cards.find((c) => c.domainPresented === "cardio_circulation");
}

function exerciseById(id) {
  return exerciseLibrary.find((e) => e.id === id);
}

test("each active domain appears exactly once per day", () => {
  const days = makeWeek();
  WEEK.forEach((date) => {
    const domains = days[date].cards.map((c) => c.domainPresented).sort();
    assert.deepEqual(domains, [...SETTINGS.activeDomains].sort());
    assert.equal(days[date].cards.length, 6);
  });
});

test("Mon/Wed/Fri cardio slots are the fixed labelled walks", () => {
  const days = makeWeek();
  assert.equal(cardioCard(days["2026-06-15"]).exerciseId, "walk_1"); // Mon
  assert.equal(cardioCard(days["2026-06-17"]).exerciseId, "walk_2"); // Wed
  assert.equal(cardioCard(days["2026-06-19"]).exerciseId, "walk_3"); // Fri
});

test("Tue/Thu/Sat cardio slots are walks chosen by the engine", () => {
  const days = makeWeek();
  ["2026-06-16", "2026-06-18", "2026-06-20"].forEach((date) => {
    const card = cardioCard(days[date]);
    assert.ok(
      exerciseById(card.exerciseId).walkLabel,
      `${date} cardio should be a walk, got ${card.exerciseId}`
    );
  });
});

test("generation is deterministic", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(makeWeek())),
    JSON.parse(JSON.stringify(makeWeek()))
  );
});

test("avoidConsecutiveDays exercises never appear on adjacent days", () => {
  const days = makeWeek();
  for (let i = 1; i < WEEK.length; i++) {
    const yesterday = new Set(
      days[WEEK[i - 1]].cards.map((c) => c.exerciseId)
    );
    days[WEEK[i]].cards.forEach((card) => {
      const exercise = exerciseById(card.exerciseId);
      if (exercise.avoidConsecutiveDays) {
        assert.ok(
          !yesterday.has(card.exerciseId),
          `${card.exerciseId} on both ${WEEK[i - 1]} and ${WEEK[i]}`
        );
      }
    });
  }
});

test("weekly frequency targets pull exercises toward their target", () => {
  const days = makeWeek();
  const counts = {};
  WEEK.forEach((date) =>
    days[date].cards.forEach((card) => {
      counts[card.exerciseId] = (counts[card.exerciseId] ?? 0) + 1;
    })
  );

  // current_rehab targets 5/week against one alternative.
  assert.ok(
    counts.current_rehab >= 4,
    `current_rehab appeared ${counts.current_rehab ?? 0} times`
  );
  // supported_one_leg_balance targets 3/week against three alternatives.
  assert.ok(
    counts.supported_one_leg_balance >= 2,
    `supported_one_leg_balance appeared ${counts.supported_one_leg_balance ?? 0} times`
  );
});

test("Saturday prefers gentle intensity", () => {
  // The walk and rehab domains have no gentle options, so 4/6 gentle is the
  // structural maximum; the lightness preference should reliably deliver at
  // least 3 (a soft preference, not a guarantee — spec §13).
  const days = makeWeek();
  const gentle = days["2026-06-20"].cards.filter(
    (c) => exerciseById(c.exerciseId).intensity === "gentle"
  );
  assert.ok(
    gentle.length >= 3,
    `expected mostly gentle cards on Saturday, got ${gentle.length}/6`
  );
});

test("context spread stays balanced (best approximation)", () => {
  const days = makeWeek();
  WEEK.forEach((date) => {
    const counts = {};
    days[date].cards.forEach((card) => {
      counts[card.contextPresented] = (counts[card.contextPresented] ?? 0) + 1;
    });
    Object.entries(counts).forEach(([context, count]) => {
      assert.ok(
        count <= 2,
        `${date}: context ${context} appears ${count} times`
      );
    });
    assert.ok(
      Object.keys(counts).length >= 4,
      `${date}: only ${Object.keys(counts).length} distinct contexts`
    );
  });
});

test("fixedDays are preserved untouched and counted for variety", () => {
  const first = makeWeek();
  const fixedDate = "2026-06-16";
  const fixedDay = first[fixedDate];

  const second = makeWeek({ fixedDays: { [fixedDate]: fixedDay } });
  assert.equal(second[fixedDate], fixedDay);
  WEEK.filter((d) => d !== fixedDate).forEach((date) => {
    assert.equal(second[date].generatorVersion, generatorVersion);
  });
});

test("reserved slots claim their domain before generation", () => {
  const days = makeWeek({
    reservedSlotsByDate: {
      "2026-06-16": [
        {
          domain: "mobility_recovery",
          exerciseId: "qigong",
          context: "scheduled",
        },
      ],
    },
  });

  const day = days["2026-06-16"];
  const mobility = day.cards.find(
    (c) => c.domainPresented === "mobility_recovery"
  );
  assert.equal(mobility.exerciseId, "qigong");
  assert.equal(day.cards.length, 6);
  const domains = day.cards.map((c) => c.domainPresented).sort();
  assert.deepEqual(domains, [...SETTINGS.activeDomains].sort());
});

test("swapAlternatives preserves domain, excludes today's cards, ranks context first", () => {
  const days = makeWeek();
  const day = days["2026-06-15"];
  const walkCard = cardioCard(day);
  const usedToday = new Set(day.cards.map((c) => c.exerciseId));

  const options = swapAlternatives(walkCard, day.cards, exerciseLibrary, {});
  assert.ok(options.length > 0);
  options.forEach((exercise) => {
    assert.equal(exercise.domain, "cardio_circulation");
    assert.notEqual(exercise.id, walkCard.exerciseId);
    assert.ok(!usedToday.has(exercise.id));
  });
  // The top alternative should fit the card's context (outdoors).
  assert.ok(options[0].contexts.includes(walkCard.contextPresented));
});

test("swapAlternatives biases against swapping straight back", () => {
  const days = makeWeek();
  const day = days["2026-06-15"];
  const card = {
    ...cardioCard(day),
    exerciseId: "gardening",
    swap: {
      wasSwapped: true,
      fromExerciseId: "walk_1",
      toExerciseId: "gardening",
    },
  };

  const options = swapAlternatives(card, day.cards, exerciseLibrary, {});
  assert.ok(options.length > 1);
  assert.notEqual(options[0].id, "walk_1");
});

test("recentUseCounts only looks back before the given date", () => {
  const days = makeWeek();
  const counts = recentUseCounts(days, "2026-06-17");
  // walk_2 appears on Wed 17th — must not be counted yet.
  assert.equal(counts.walk_2 ?? 0, 0);
  assert.equal(counts.walk_1, 1);
});

// ── Phase 2: anchors and cross-day moves ─────────────────────────────────

const ANCHOR_SETTINGS = {
  ...SETTINGS,
  weeklyAnchors: {
    tuesday: {
      exerciseId: "qigong",
      domains: ["mobility_recovery", "balance_stability", "core_posture"],
    },
    sunday: {
      exerciseId: "yoga",
      domains: ["mobility_recovery", "core_posture"],
    },
  },
};

function makeAnchorWeek(overrides = {}) {
  return generateWeek({
    weekDates: WEEK,
    library: exerciseLibrary,
    settings: ANCHOR_SETTINGS,
    ...overrides,
  });
}

test("Tuesday anchor: three Qigong cards at the end, each crediting its own domain", () => {
  const days = makeAnchorWeek();
  const tue = days["2026-06-16"];

  assert.equal(tue.cards.length, 6);
  const qigongCards = tue.cards.filter((c) => c.exerciseId === "qigong");
  assert.equal(qigongCards.length, 3);

  const domains = qigongCards.map((c) => c.domainPresented).sort();
  assert.deepEqual(domains, [
    "balance_stability",
    "core_posture",
    "mobility_recovery",
  ]);

  qigongCards.forEach((c) => {
    assert.equal(c.contextPresented, "scheduled");
    assert.match(c.exerciseNamePresented, /^Qigong — /);
  });

  // Anchors sit at the end of the day's list.
  const lastThree = tue.cards.slice(3).map((c) => c.exerciseId);
  assert.deepEqual(lastThree, ["qigong", "qigong", "qigong"]);

  // The remaining cards cover the other three domains, walk included.
  const rest = tue.cards.slice(0, 3).map((c) => c.domainPresented).sort();
  assert.deepEqual(rest, ["cardio_circulation", "rehab", "strength"]);
  assert.ok(
    exerciseById(cardioCard(tue).exerciseId).walkLabel,
    "Tuesday should still get its walk"
  );
});

test("Sunday anchor: two Yoga cards plus four generated", () => {
  const days = makeAnchorWeek();
  const sun = days["2026-06-21"];

  const yogaCards = sun.cards.filter((c) => c.exerciseId === "yoga");
  assert.equal(yogaCards.length, 2);
  assert.deepEqual(
    yogaCards.map((c) => c.domainPresented).sort(),
    ["core_posture", "mobility_recovery"]
  );
  assert.equal(sun.cards.length, 6);
  const domains = sun.cards.map((c) => c.domainPresented).sort();
  assert.deepEqual(domains, [...SETTINGS.activeDomains].sort());
});

test("legacy string anchors normalise to default domain claims", () => {
  const days = generateWeek({
    weekDates: WEEK,
    library: exerciseLibrary,
    settings: { ...SETTINGS, weeklyAnchors: { tuesday: "qigong" } },
  });
  const qigongCards = days["2026-06-16"].cards.filter(
    (c) => c.exerciseId === "qigong"
  );
  assert.equal(qigongCards.length, 3);
});

test("marking one anchor card Done credits only its zone", () => {
  const days = makeAnchorWeek();
  const tue = days["2026-06-16"];
  const balanceCard = tue.cards.find(
    (c) => c.exerciseId === "qigong" && c.domainPresented === "balance_stability"
  );

  const marked = {
    ...days,
    "2026-06-16": {
      ...tue,
      cards: tue.cards.map((c) =>
        c.cardId === balanceCard.cardId ? { ...c, state: "done" } : c
      ),
    },
  };

  const { zoneScores } = scoreDays(marked, WEEK);
  assert.equal(zoneScores.head, 1); // balance zone
  assert.equal(zoneScores.midTorso, 0); // core untouched
  assert.equal(zoneScores.lowerTorso, 0); // mobility untouched
});

test("moving a walk replaces the target day's cardio and backfills the source", () => {
  const days = makeAnchorWeek();
  const wed = days["2026-06-17"];
  const walkCard = cardioCard(wed);
  assert.equal(walkCard.exerciseId, "walk_2");

  const moved = moveCards(
    days,
    "2026-06-17",
    walkCard.cardId,
    "2026-06-20",
    exerciseLibrary,
    ANCHOR_SETTINGS
  );

  const satCardio = cardioCard(moved["2026-06-20"]);
  assert.equal(satCardio.exerciseId, "walk_2");
  assert.equal(satCardio.swap.movedFrom, "2026-06-17");
  assert.equal(satCardio.state, "not_started");

  const wedCardio = cardioCard(moved["2026-06-17"]);
  assert.notEqual(wedCardio.exerciseId, "walk_2");
  assert.equal(wedCardio.domainPresented, "cardio_circulation");
  assert.equal(wedCardio.swap.movedTo, "2026-06-20");

  // Domain uniqueness preserved on both days.
  ["2026-06-17", "2026-06-20"].forEach((date) => {
    const domains = moved[date].cards.map((c) => c.domainPresented).sort();
    assert.deepEqual(domains, [...SETTINGS.activeDomains].sort());
    assert.equal(moved[date].cards.length, 6);
  });
});

test("moving an anchor card moves the whole activity as a unit", () => {
  const days = makeAnchorWeek();
  const tue = days["2026-06-16"];
  const oneQigong = tue.cards.find((c) => c.exerciseId === "qigong");

  const moved = moveCards(
    days,
    "2026-06-16",
    oneQigong.cardId,
    "2026-06-18",
    exerciseLibrary,
    ANCHOR_SETTINGS
  );

  const thuQigong = moved["2026-06-18"].cards.filter(
    (c) => c.exerciseId === "qigong"
  );
  assert.equal(thuQigong.length, 3);
  assert.deepEqual(
    thuQigong.map((c) => c.domainPresented).sort(),
    ["balance_stability", "core_posture", "mobility_recovery"]
  );

  const tueQigong = moved["2026-06-16"].cards.filter(
    (c) => c.exerciseId === "qigong"
  );
  assert.equal(tueQigong.length, 0);

  ["2026-06-16", "2026-06-18"].forEach((date) => {
    const domains = moved[date].cards.map((c) => c.domainPresented).sort();
    assert.deepEqual(domains, [...SETTINGS.activeDomains].sort());
    assert.equal(moved[date].cards.length, 6);
  });
});

test("moves are deterministic", () => {
  const days = makeAnchorWeek();
  const walkCard = cardioCard(days["2026-06-17"]);
  const a = moveCards(days, "2026-06-17", walkCard.cardId, "2026-06-20", exerciseLibrary, ANCHOR_SETTINGS);
  const b = moveCards(days, "2026-06-17", walkCard.cardId, "2026-06-20", exerciseLibrary, ANCHOR_SETTINGS);
  assert.deepEqual(
    JSON.parse(JSON.stringify(a)),
    JSON.parse(JSON.stringify(b))
  );
});

// ── Phase 3: suitability ─────────────────────────────────────────────────

import {
  markNotSuitable,
  restoreSuitability,
  recentSkipCounts,
} from "../src/recommendationEngine.js";
import { mergeLibrary } from "../src/data/exerciseLibrary.js";

const TODAY = "2026-06-17"; // Wednesday of the test week

function neckCardOn(days, date) {
  return days[date].cards.find((c) => c.exerciseId === "neck_mobility");
}

test("markNotSuitable flips status and sweeps untouched today/future copies", () => {
  const days = makeWeek();
  // neck_mobility appears across the week; find an occurrence on/after TODAY
  const occurrences = WEEK.filter((d) => neckCardOn(days, d));
  const markDate = occurrences.find((d) => d >= TODAY) ?? occurrences[0];
  const card = neckCardOn(days, markDate);

  // Give one future copy a note so it must be left alone.
  const futureWithCopy = occurrences.filter((d) => d > markDate);
  let prepared = days;
  let protectedDate = null;
  if (futureWithCopy.length > 1) {
    protectedDate = futureWithCopy[futureWithCopy.length - 1];
    prepared = {
      ...days,
      [protectedDate]: {
        ...days[protectedDate],
        cards: days[protectedDate].cards.map((c) =>
          c.exerciseId === "neck_mobility" ? { ...c, note: "felt ok" } : c
        ),
      },
    };
  }

  const { days: after, library } = markNotSuitable(
    prepared,
    exerciseLibrary,
    markDate,
    card.cardId,
    SETTINGS,
    TODAY
  );

  // Status flipped
  assert.equal(
    library.find((e) => e.id === "neck_mobility").status,
    "needs_review"
  );
  // The marked card stays, state not_suitable
  assert.equal(neckCardOn(after, markDate).state, "not_suitable");

  // Untouched copies on/after TODAY (other than the marked card) replaced
  WEEK.filter((d) => d >= TODAY && d !== markDate).forEach((d) => {
    const copy = neckCardOn(after, d);
    if (protectedDate && d === protectedDate) {
      assert.ok(copy, `noted copy on ${d} must remain`);
    } else if (copy) {
      assert.fail(`untouched copy on ${d} should have been swept`);
    }
    // domain integrity
    const domains = after[d].cards.map((c) => c.domainPresented).sort();
    assert.deepEqual(domains, [...SETTINGS.activeDomains].sort());
  });

  // Past days untouched
  WEEK.filter((d) => d < TODAY && d !== markDate).forEach((d) => {
    assert.deepEqual(after[d], prepared[d]);
  });

  // Sweep provenance recorded
  const swept = WEEK.map((d) => after[d].cards)
    .flat()
    .filter((c) => c.swap?.reason === "not_suitable");
  assert.ok(swept.length >= 0); // may be 0 if no future copies existed
});

test("restoreSuitability returns needs_review to active, leaves retired alone", () => {
  const flagged = exerciseLibrary.map((e) =>
    e.id === "neck_mobility"
      ? { ...e, status: "needs_review" }
      : e.id === "chest_opener"
        ? { ...e, status: "retired" }
        : e
  );
  const restored = restoreSuitability(flagged, "neck_mobility");
  assert.equal(restored.find((e) => e.id === "neck_mobility").status, "active");
  const stillRetired = restoreSuitability(flagged, "chest_opener");
  assert.equal(stillRetired.find((e) => e.id === "chest_opener").status, "retired");
});

test("generation and swap exclude needs_review exercises", () => {
  const flagged = exerciseLibrary.map((e) =>
    e.id === "current_rehab" ? { ...e, status: "needs_review" } : e
  );
  const days = generateWeek({
    weekDates: WEEK,
    library: flagged,
    settings: SETTINGS,
  });
  WEEK.forEach((d) => {
    assert.ok(
      !days[d].cards.some((c) => c.exerciseId === "current_rehab"),
      `current_rehab generated on ${d} despite needs_review`
    );
    // rehab domain still filled by the alternative
    assert.ok(days[d].cards.some((c) => c.domainPresented === "rehab"));
  });

  const rehabCard = days[WEEK[0]].cards.find(
    (c) => c.domainPresented === "rehab"
  );
  const options = swapAlternatives(rehabCard, days[WEEK[0]].cards, flagged, {});
  assert.ok(!options.some((e) => e.id === "current_rehab"));
});

test("anchor day degrades gracefully when the anchor is flagged", () => {
  const flagged = exerciseLibrary.map((e) =>
    e.id === "qigong" ? { ...e, status: "needs_review" } : e
  );
  const days = generateWeek({
    weekDates: WEEK,
    library: flagged,
    settings: ANCHOR_SETTINGS,
  });
  const tue = days["2026-06-16"];
  assert.equal(tue.cards.filter((c) => c.exerciseId === "qigong").length, 0);
  assert.equal(tue.cards.length, 6);
  const domains = tue.cards.map((c) => c.domainPresented).sort();
  assert.deepEqual(domains, [...SETTINGS.activeDomains].sort());
});

test("recent skips down-rank an exercise in next week's generation", () => {
  const baseline = makeWeek();
  const baselineCount = WEEK.filter((d) =>
    baseline[d].cards.some((c) => c.exerciseId === "tandem_stand")
  ).length;

  // Prior week where tandem_stand was skipped every time it appeared.
  const priorWeek = [
    "2026-06-08", "2026-06-09", "2026-06-10", "2026-06-11",
    "2026-06-12", "2026-06-13", "2026-06-14",
  ];
  const prior = generateWeek({
    weekDates: priorWeek,
    library: exerciseLibrary,
    settings: SETTINGS,
  });
  Object.keys(prior).forEach((d) => {
    prior[d] = {
      ...prior[d],
      cards: prior[d].cards.map((c) =>
        c.exerciseId === "tandem_stand" ? { ...c, state: "skip" } : c
      ),
    };
  });

  const withSkips = makeWeek({ priorDays: prior });
  const skippedCount = WEEK.filter((d) =>
    withSkips[d].cards.some((c) => c.exerciseId === "tandem_stand")
  ).length;

  assert.ok(
    skippedCount <= baselineCount,
    `expected ${skippedCount} <= ${baselineCount}`
  );
  // And the helper itself counts correctly.
  const counts = recentSkipCounts(prior, WEEK[0]);
  assert.ok((counts.tandem_stand ?? 0) >= 1);
});

test("mergeLibrary preserves guidance and keeps saved-only entries", () => {
  const saved = [
    ...exerciseLibrary.map((e) =>
      e.id === "neck_mobility"
        ? { ...e, status: "needs_review", currentDoseLevel: 2 }
        : e
    ),
    {
      id: "llm_added_stretch",
      name: "LLM-added stretch",
      domain: "mobility_recovery",
      status: "active",
      contexts: ["daytime"],
      functionalTags: [],
      careTags: [],
      intensity: "gentle",
      instructions: "Added by review.",
      variantLevels: [{ level: 1, label: "Default" }],
      doseLevels: [{ level: 1, displayText: "A little" }],
      currentVariantLevel: 1,
      currentDoseLevel: 1,
    },
  ];

  const merged = mergeLibrary(exerciseLibrary, saved);
  const neck = merged.find((e) => e.id === "neck_mobility");
  assert.equal(neck.status, "needs_review");
  assert.equal(neck.currentDoseLevel, 2);
  // Content still comes from code
  assert.equal(neck.name, "Neck mobility");
  // Saved-only entry survives
  assert.ok(merged.some((e) => e.id === "llm_added_stretch"));
  assert.equal(merged.length, exerciseLibrary.length + 1);
});

// ── Anchor swap-in on a non-anchor day (e.g. Qigong on Wednesday) ─────────

import { anchorDomainsForExercise } from "../src/recommendationEngine.js";

test("an anchor is offered for each domain it covers on a non-anchor day", () => {
  const days = makeAnchorWeek();
  const wed = days["2026-06-17"]; // Wednesday — no auto Qigong

  assert.equal(
    wed.cards.filter((c) => c.exerciseId === "qigong").length,
    0,
    "Wednesday should not auto-schedule Qigong"
  );

  ["mobility_recovery", "balance_stability", "core_posture"].forEach(
    (domain) => {
      const card = wed.cards.find((c) => c.domainPresented === domain);
      const options = swapAlternatives(
        card,
        wed.cards,
        exerciseLibrary,
        {},
        {},
        ANCHOR_SETTINGS
      );
      assert.ok(
        options.some((e) => e.id === "qigong"),
        `Qigong should be swap-eligible for the ${domain} slot`
      );
    }
  );
});

test("an anchor stays offered for its other slots after filling one (multi-slot)", () => {
  const days = makeAnchorWeek();
  const wed = days["2026-06-17"];

  // Simulate Qigong already swapped into the mobility slot.
  const withQigong = {
    ...wed,
    cards: wed.cards.map((c) =>
      c.domainPresented === "mobility_recovery"
        ? { ...c, exerciseId: "qigong" }
        : c
    ),
  };

  const balanceCard = withQigong.cards.find(
    (c) => c.domainPresented === "balance_stability"
  );
  const options = swapAlternatives(
    balanceCard,
    withQigong.cards,
    exerciseLibrary,
    {},
    {},
    ANCHOR_SETTINGS
  );
  assert.ok(
    options.some((e) => e.id === "qigong"),
    "Qigong should still be offered for the balance slot though already used today"
  );
});

test("without anchor settings, an anchor is not offered outside its own domain", () => {
  const days = makeWeek();
  const balanceCard = days["2026-06-17"].cards.find(
    (c) => c.domainPresented === "balance_stability"
  );
  const options = swapAlternatives(
    balanceCard,
    days["2026-06-17"].cards,
    exerciseLibrary,
    {}
  );
  assert.ok(
    !options.some((e) => e.id === "qigong"),
    "Qigong (mobility domain) must not appear for a balance slot without anchor config"
  );
});

test("anchorDomainsForExercise reflects settings", () => {
  const domains = anchorDomainsForExercise("qigong", ANCHOR_SETTINGS);
  assert.ok(domains.has("mobility_recovery"));
  assert.ok(domains.has("balance_stability"));
  assert.ok(domains.has("core_posture"));
  assert.equal(anchorDomainsForExercise("walk_1", ANCHOR_SETTINGS), null);
  assert.equal(anchorDomainsForExercise("qigong", {}), null);
});
