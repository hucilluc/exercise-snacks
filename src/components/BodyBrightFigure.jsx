const zones = [
  { id: "head", label: "Balance", color: "#8a1dff", stroke: "#df8aff" },
  { id: "upperTorso", label: "Cardio", color: "#18dff0", stroke: "#7bf0ff" },
  { id: "midTorso", label: "Core", color: "#ffe100", stroke: "#ffee6b" },
  { id: "lowerTorso", label: "Mobility", color: "#005dff", stroke: "#387cff" },
  { id: "arms", label: "Rehab", color: "#ff5a1f", stroke: "#ff8742" },
  { id: "legs", label: "Strength", color: "#1eff3c", stroke: "#6eff89" },
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function progressLevel(score = 0, weeklyTarget = 5) {
  if (score <= 0) {
    return 0;
  }

  const cappedScore = clamp(score, 0, weeklyTarget);

  if (cappedScore >= weeklyTarget) {
    return 1;
  }

  const steps = {
    0.5: 0.015,
    1: 0.03,
    1.5: 0.055,
    2: 0.09,
    2.5: 0.14,
    3: 0.22,
    3.5: 0.32,
    4: 0.46,
    4.5: 0.62,
  };

  return steps[cappedScore] ?? Math.pow(cappedScore / weeklyTarget, 2.4);
}

function zoneStyle(zone, score = 0, weeklyTarget = 5) {
  const level = progressLevel(score, weeklyTarget);

  if (level <= 0) {
    return {
      fill: "#101827",
      fillOpacity: 0.72,
      stroke: "rgba(148, 163, 184, 0.42)",
      strokeWidth: 5,
      filter: "none",
    };
  }

  return {
    fill: zone.color,
    fillOpacity: 0.035 + level * 0.915,
    stroke: zone.stroke,
    strokeOpacity: 0.12 + level * 0.88,
    strokeWidth: 3 + level * 4,
    filter: `url(#bb-glow-${zone.id})`,
  };
}

function glowStrength(score = 0, weeklyTarget = 5) {
  const level = progressLevel(score, weeklyTarget);

  return {
    softBlur: 1 + level * 13,
    wideBlur: 2 + level * 28,
    opacity: 0.03 + level * 0.97,
  };
}

export default function BodyBrightFigure({ zoneScores = {}, weeklyTarget = 5 }) {
  const head = zones[0];
  const upperTorso = zones[1];
  const midTorso = zones[2];
  const lowerTorso = zones[3];
  const arms = zones[4];
  const legs = zones[5];

  return (
    <div className="body-bright-figure">
      <svg
        className="body-svg symbolic-body"
        viewBox="0 0 400 700"
        role="img"
        aria-label="Body Bright figure"
      >
        <defs>
          <radialGradient id="bb-bg-glow" cx="50%" cy="95%" r="40%">
            <stop offset="0%" stopColor="#0c2511" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#090d16" stopOpacity="0" />
          </radialGradient>

          {zones.map((zone) => {
            const strength = glowStrength(zoneScores[zone.id], weeklyTarget);

            return (
              <filter
                key={zone.id}
                id={`bb-glow-${zone.id}`}
                x="-70%"
                y="-70%"
                width="240%"
                height="240%"
              >
                <feGaussianBlur
                  stdDeviation={strength.softBlur}
                  result="blur1"
                />
                <feGaussianBlur
                  stdDeviation={strength.wideBlur}
                  result="blur2"
                />
                <feComponentTransfer in="blur2" result="wideGlow">
                  <feFuncA type="linear" slope={strength.opacity} />
                </feComponentTransfer>
                <feMerge>
                  <feMergeNode in="wideGlow" />
                  <feMergeNode in="blur1" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            );
          })}
        </defs>

        <ellipse cx="200" cy="660" rx="100" ry="25" fill="url(#bb-bg-glow)" />

        <g strokeLinecap="round" strokeLinejoin="round">
          <circle
            cx="200"
            cy="110"
            r="45"
            style={zoneStyle(head, zoneScores.head, weeklyTarget)}
          />

          <path
            d="M 140 185
               Q 200 170 260 185
               L 250 270
               Q 200 275 150 270 Z"
            style={zoneStyle(upperTorso, zoneScores.upperTorso, weeklyTarget)}
          />

          <path
            d="M 151 280
               Q 200 285 249 280
               L 247 360
               Q 200 365 153 360 Z"
            style={zoneStyle(midTorso, zoneScores.midTorso, weeklyTarget)}
          />

          <path
            d="M 154 370
               Q 200 375 246 370
               L 245 420
               Q 200 450 155 420 Z"
            style={zoneStyle(lowerTorso, zoneScores.lowerTorso, weeklyTarget)}
          />

          <path
            d="M 115 205
               Q 135 320 115 425
               A 15 15 0 0 1 85 420
               Q 100 310 93 210
               A 15 15 0 0 1 115 205 Z"
            style={zoneStyle(arms, zoneScores.arms, weeklyTarget)}
          />

          <path
            d="M 285 205
               Q 265 320 285 425
               A 15 15 0 0 0 315 420
               Q 300 310 307 210
               A 15 15 0 0 0 285 205 Z"
            style={zoneStyle(arms, zoneScores.arms, weeklyTarget)}
          />

          <path
            d="M 143 435
               L 178 435
               Q 175 550 185 660
               A 22 22 0 0 1 138 660
               Q 150 540 143 435 Z"
            style={zoneStyle(legs, zoneScores.legs, weeklyTarget)}
          />

          <path
            d="M 222 435
               L 257 435
               Q 250 540 262 660
               A 22 22 0 0 1 215 660
               Q 225 550 222 435 Z"
            style={zoneStyle(legs, zoneScores.legs, weeklyTarget)}
          />
        </g>
      </svg>

      <div className="zone-list">
        {zones.map((zone) => {
          const score = zoneScores[zone.id] || 0;
          const level = progressLevel(score, weeklyTarget);

          return (
            <div
              className={`zone-chip ${score > 0 ? "lit" : ""}`}
              key={zone.id}
              style={{
                "--zone-color": zone.color,
                "--zone-level": level,
              }}
            >
              <span />
              {zone.label}: {score}/{weeklyTarget}
            </div>
          );
        })}
      </div>
    </div>
  );
}