// Import validation for the v4 profile capsule (Data Spec §10, §24).
//
// Three result tiers:
//   errors           — file refused (structure, schema, scoring rules)
//   warnings         — importable after user confirmation
//   protectedChanges — the file alters its own review guidance/permissions;
//                      refused unless the user explicitly allows it
//
// The protected sections are compared against the CURRENT profile, not the
// code defaults: once the user deliberately customises their guidance,
// their version becomes the baseline. A reviewing LLM that preserves the
// guidance passes; one that rewrites its own permissions does not — the
// app-side check is the enforcement, the JSON text is only advisory.

import { bodyBright } from "./data/bodyBright.js";

export const REQUIRED_SECTIONS = [
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
];

export const PROTECTED_SECTIONS = [
  "llmReviewGuide",
  "llmPermissions",
  "validationRules",
];

const ALLOWED_STATES = new Set([
  "not_started",
  "done",
  "tried",
  "skip",
  "not_suitable",
]);

const KNOWN_DOMAINS = new Set(Object.keys(bodyBright.domainToZone));

// Order-insensitive deep equality for plain JSON values.
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (typeof a === "object") {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (!deepEqual(keysA, keysB)) return false;
    return keysA.every((key) => deepEqual(a[key], b[key]));
  }

  return false;
}

export function validateProfile(parsed, currentProfile) {
  const errors = [];
  const warnings = [];
  const protectedChanges = [];

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      errors: ["The file is not a profile object."],
      warnings,
      protectedChanges,
      summary: null,
    };
  }

  // Schema version
  if (parsed.schemaVersion !== 4) {
    errors.push(
      `Unsupported schema version: ${parsed.schemaVersion ?? "missing"} (expected 4).`
    );
  }

  // Required sections — checked against the app's canonical list, never the
  // file's own validationRules.
  REQUIRED_SECTIONS.forEach((section) => {
    if (!(section in parsed)) {
      errors.push(`Missing required section: ${section}.`);
    }
  });

  // Body Bright scoring rules must match exactly — they define what
  // historical brightness means, so no import may change them.
  if (parsed.bodyBright) {
    if (!deepEqual(parsed.bodyBright.domainToZone, bodyBright.domainToZone)) {
      errors.push(
        "The file changes the Body Bright domain-to-zone mapping, which is fixed."
      );
    }
    if (!deepEqual(parsed.bodyBright.stateScores, bodyBright.stateScores)) {
      errors.push(
        "The file changes the Body Bright state scores, which are fixed."
      );
    }
  }

  // Exercise library structure
  const libraryIds = new Set();
  if ("exerciseLibrary" in parsed) {
    if (!Array.isArray(parsed.exerciseLibrary)) {
      errors.push("exerciseLibrary must be a list of exercises.");
    } else {
      parsed.exerciseLibrary.forEach((exercise, index) => {
        if (!exercise?.id || !exercise.name || !exercise.domain) {
          errors.push(
            `Library entry ${index + 1} is missing id, name or domain.`
          );
          return;
        }
        libraryIds.add(exercise.id);
        if (!KNOWN_DOMAINS.has(exercise.domain)) {
          errors.push(
            `Library entry "${exercise.id}" has unknown domain "${exercise.domain}".`
          );
        }
      });
    }
  }

  // Days / cards structure
  const unknownExerciseIds = new Set();
  if ("days" in parsed) {
    if (
      typeof parsed.days !== "object" ||
      parsed.days === null ||
      Array.isArray(parsed.days)
    ) {
      errors.push("days must be an object keyed by date.");
    } else {
      Object.entries(parsed.days).forEach(([date, day]) => {
        if (!Array.isArray(day?.cards)) {
          errors.push(`Day ${date} has no cards list.`);
          return;
        }
        day.cards.forEach((card) => {
          if (!card?.cardId || !card.domainPresented || !card.exerciseId) {
            errors.push(
              `Day ${date} has a card missing cardId, domainPresented or exerciseId.`
            );
            return;
          }
          if (!ALLOWED_STATES.has(card.state)) {
            errors.push(
              `Day ${date}, card ${card.cardId}: unknown state "${card.state}".`
            );
          }
          if (libraryIds.size > 0 && !libraryIds.has(card.exerciseId)) {
            unknownExerciseIds.add(card.exerciseId);
          }
        });
      });
    }
  }

  if (unknownExerciseIds.size > 0) {
    warnings.push(
      `History references ${unknownExerciseIds.size} exercise id(s) not in the file's library (${[...unknownExerciseIds].slice(0, 5).join(", ")}${unknownExerciseIds.size > 5 ? ", …" : ""}). History will still display.`
    );
  }

  // Less history than the current profile — the stale-export guard.
  if (currentProfile && parsed.days && parsed.weeklySnapshots) {
    const importedDays = Object.keys(parsed.days).length;
    const currentDays = Object.keys(currentProfile.days ?? {}).length;
    const importedSnapshots = Object.keys(parsed.weeklySnapshots).length;
    const currentSnapshots = Object.keys(
      currentProfile.weeklySnapshots ?? {}
    ).length;

    if (importedDays < currentDays || importedSnapshots < currentSnapshots) {
      warnings.push(
        `The file contains less history than your current data (${importedDays} vs ${currentDays} days, ${importedSnapshots} vs ${currentSnapshots} weekly snapshots). Importing will replace your current data.`
      );
    }
  }

  // Protected sections: review guidance and permissions may not change as a
  // side-effect of a review. Compared against the current profile so a
  // deliberately customised baseline stays protected too.
  if (currentProfile) {
    PROTECTED_SECTIONS.forEach((section) => {
      if (
        section in parsed &&
        !deepEqual(parsed[section], currentProfile[section])
      ) {
        protectedChanges.push(section);
      }
    });
  }

  const summary =
    errors.length > 0
      ? null
      : {
          profileName: parsed.aboutThisProfile?.profileName ?? "Unnamed profile",
          lastUpdated: parsed.aboutThisProfile?.lastUpdated ?? "unknown",
          dayCount: Object.keys(parsed.days ?? {}).length,
          snapshotCount: Object.keys(parsed.weeklySnapshots ?? {}).length,
          libraryCount: Array.isArray(parsed.exerciseLibrary)
            ? parsed.exerciseLibrary.length
            : 0,
        };

  return { errors, warnings, protectedChanges, summary };
}
