// Central Body Bright configuration.
// Exercises store domains; zones are always derived through domainToZone.
// (Data Specification v4 §11: this mapping must never be duplicated per-exercise.)

export const bodyBright = {
  version: 1,
  weeklyTarget: 5,
  domainToZone: {
    cardio_circulation: "upperTorso",
    strength: "legs",
    core_posture: "midTorso",
    balance_stability: "head",
    mobility_recovery: "lowerTorso",
    rehab: "arms",
  },
  stateScores: {
    done: 1,
    tried: 0.5,
    skip: 0,
    not_suitable: 0,
  },
};

export const domainLabels = {
  cardio_circulation: "Cardio & circulation",
  strength: "Strength",
  core_posture: "Core & posture",
  balance_stability: "Balance & stability",
  mobility_recovery: "Mobility & recovery",
  rehab: "Rehab",
};

export const contextLabels = {
  getting_up: "Getting up",
  kitchen: "Kitchen",
  outdoors: "Outdoors",
  sitting_break: "Sitting break",
  daytime: "Daytime",
  scheduled: "Scheduled",
};

export const zoneColors = {
  head: "#8a1dff",
  upperTorso: "#18dff0",
  midTorso: "#ffe100",
  lowerTorso: "#005dff",
  arms: "#ff5a1f",
  legs: "#1eff3c",
};

export function zoneForDomain(domain) {
  return bodyBright.domainToZone[domain] ?? null;
}

export function zoneColorForDomain(domain) {
  return zoneColors[zoneForDomain(domain)] ?? "#22d3ee";
}

export function emptyZoneScores() {
  return {
    head: 0,
    upperTorso: 0,
    midTorso: 0,
    lowerTorso: 0,
    arms: 0,
    legs: 0,
  };
}

export function emptyStateCounts() {
  return {
    done: 0,
    tried: 0,
    skip: 0,
    not_suitable: 0,
  };
}

// Accumulate weekly zone scores and state counts from a set of day records.
export function scoreDays(dayRecords, dates) {
  const zoneScores = emptyZoneScores();
  const stateCounts = emptyStateCounts();

  dates.forEach((date) => {
    const day = dayRecords[date];
    if (!day) return;

    day.cards.forEach((card) => {
      const score = bodyBright.stateScores[card.state] ?? 0;
      const zone = card.bodyBrightZonePresented;

      if (zone && zone in zoneScores) {
        zoneScores[zone] += score;
      }

      if (Object.prototype.hasOwnProperty.call(stateCounts, card.state)) {
        stateCounts[card.state] += 1;
      }
    });
  });

  const totalCreditedScore = Object.values(zoneScores).reduce(
    (total, score) => total + score,
    0
  );

  return { zoneScores, stateCounts, totalCreditedScore };
}
