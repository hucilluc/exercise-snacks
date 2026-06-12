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
