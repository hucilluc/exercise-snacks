import test from "node:test";
import assert from "node:assert/strict";
import {
  validateProfile,
  REQUIRED_SECTIONS,
  PROTECTED_SECTIONS,
} from "../src/profileValidation.js";
import { createProfile, getWeekDates, getMonday } from "../src/storage.js";

const WEEK_DATES = getWeekDates(getMonday(new Date(2026, 5, 15)));

function freshProfile() {
  return createProfile(WEEK_DATES);
}

function clone(profile) {
  return JSON.parse(JSON.stringify(profile));
}

test("a freshly created profile round-trips through validation", () => {
  const current = freshProfile();
  const imported = clone(current);
  const result = validateProfile(imported, current);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.protectedChanges, []);
  assert.equal(result.summary.dayCount, 7);
  assert.ok(result.summary.libraryCount > 0);
});

test("missing required sections are rejected", () => {
  const current = freshProfile();
  REQUIRED_SECTIONS.filter((s) => s !== "schemaVersion").forEach((section) => {
    const broken = clone(current);
    delete broken[section];
    const result = validateProfile(broken, current);
    assert.ok(
      result.errors.some((e) => e.includes(section)),
      `expected error for missing ${section}`
    );
  });
});

test("wrong schema version is rejected", () => {
  const current = freshProfile();
  const broken = clone(current);
  broken.schemaVersion = 3;
  const result = validateProfile(broken, current);
  assert.ok(result.errors.some((e) => e.includes("schema version")));
});

test("tampered Body Bright scoring rules are rejected", () => {
  const current = freshProfile();

  const zones = clone(current);
  zones.bodyBright.domainToZone.strength = "arms";
  assert.ok(
    validateProfile(zones, current).errors.some((e) =>
      e.includes("domain-to-zone")
    )
  );

  const scores = clone(current);
  scores.bodyBright.stateScores.skip = 0.5;
  assert.ok(
    validateProfile(scores, current).errors.some((e) =>
      e.includes("state scores")
    )
  );
});

test("malformed cards and unknown states are rejected", () => {
  const current = freshProfile();

  const badState = clone(current);
  const firstDate = Object.keys(badState.days)[0];
  badState.days[firstDate].cards[0].state = "smashed_it";
  assert.ok(
    validateProfile(badState, current).errors.some((e) =>
      e.includes("smashed_it")
    )
  );

  const missingField = clone(current);
  delete missingField.days[firstDate].cards[0].exerciseId;
  assert.ok(
    validateProfile(missingField, current).errors.some((e) =>
      e.includes("missing cardId, domainPresented or exerciseId")
    )
  );
});

test("malformed library entries are rejected", () => {
  const current = freshProfile();
  const broken = clone(current);
  broken.exerciseLibrary[0] = { id: "ghost" };
  assert.ok(
    validateProfile(broken, current).errors.some((e) =>
      e.includes("missing id, name or domain")
    )
  );

  const badDomain = clone(current);
  badDomain.exerciseLibrary[0].domain = "telekinesis";
  assert.ok(
    validateProfile(badDomain, current).errors.some((e) =>
      e.includes("telekinesis")
    )
  );
});

test("unknown exercise ids in history warn but do not reject", () => {
  const current = freshProfile();
  const imported = clone(current);
  const firstDate = Object.keys(imported.days)[0];
  imported.days[firstDate].cards[0].exerciseId = "long_retired_exercise";

  const result = validateProfile(imported, current);
  assert.deepEqual(result.errors, []);
  assert.ok(
    result.warnings.some((w) => w.includes("long_retired_exercise"))
  );
});

test("less history than current warns but does not reject", () => {
  const current = freshProfile();
  const imported = clone(current);
  const someDate = Object.keys(imported.days)[3];
  delete imported.days[someDate];

  const result = validateProfile(imported, current);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((w) => w.includes("less history")));
});

test("changes to protected sections are flagged, not silently accepted", () => {
  const current = freshProfile();

  PROTECTED_SECTIONS.forEach((section) => {
    const sneaky = clone(current);
    if (section === "llmPermissions") {
      sneaky.llmPermissions.mayModify.push("days");
      sneaky.llmPermissions.mustNotModify = [];
    } else if (section === "llmReviewGuide") {
      sneaky.llmReviewGuide.routineReviewInstructions = ["Do whatever."];
    } else {
      sneaky.validationRules.historyRules.lockedWeeksAreReadOnly = false;
    }

    const result = validateProfile(sneaky, current);
    assert.deepEqual(result.errors, []);
    assert.ok(
      result.protectedChanges.includes(section),
      `${section} change should be flagged`
    );
  });
});

test("protected comparison uses the current profile, not code defaults", () => {
  // A user who deliberately customised their guidance: that text is the
  // baseline, so a file preserving it passes...
  const current = freshProfile();
  current.llmReviewGuide.routineReviewInstructions = [
    "My own custom instruction.",
  ];

  const faithful = clone(current);
  assert.deepEqual(validateProfile(faithful, current).protectedChanges, []);

  // ...and a file reverting it to the stock text is still flagged.
  const reverting = clone(current);
  reverting.llmReviewGuide.routineReviewInstructions =
    freshProfile().llmReviewGuide.routineReviewInstructions;
  assert.ok(
    validateProfile(reverting, current).protectedChanges.includes(
      "llmReviewGuide"
    )
  );
});

test("non-object input is rejected outright", () => {
  const current = freshProfile();
  assert.ok(validateProfile(null, current).errors.length > 0);
  assert.ok(validateProfile([1, 2], current).errors.length > 0);
  assert.ok(validateProfile("text", current).errors.length > 0);
});

test("library entry missing a required array field is rejected", () => {
  const current = freshProfile();
  ["doseLevels", "variantLevels", "contexts"].forEach((field) => {
    const broken = clone(current);
    delete broken.exerciseLibrary[0][field];
    const result = validateProfile(broken, current);
    assert.ok(
      result.errors.some((e) => e.includes(field) && e.includes(broken.exerciseLibrary[0].id)),
      `expected error naming ${field}`
    );
  });
});
