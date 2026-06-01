const zones = [
  { id: "head", label: "Balance", color: "#8a1dff", stroke: "#df8aff" },
  { id: "upperTorso", label: "Cardio", color: "#18dff0", stroke: "#7bf0ff" },
  { id: "midTorso", label: "Core", color: "#ffe100", stroke: "#ffee6b" },
  { id: "lowerTorso", label: "Mobility", color: "#005dff", stroke: "#387cff" },
  { id: "arms", label: "Rehab", color: "#ff5a1f", stroke: "#ff8742" },
  { id: "legs", label: "Strength", color: "#1eff3c", stroke: "#6eff89" },
];

function zoneStyle(zone, score = 0) {
  if (score >= 1) {
    return {
      fill: zone.color,
      fillOpacity: 0.9,
      stroke: zone.stroke,
      filter: `url(#bb-glow-${zone.id})`,
    };
  }

  if (score >= 0.5) {
    return {
      fill: zone.color,
      fillOpacity: 0.45,
      stroke: zone.stroke,
      filter: `url(#bb-glow-${zone.id})`,
    };
  }

  return {
    fill: "#101827",
    fillOpacity: 0.72,
    stroke: "rgba(148, 163, 184, 0.42)",
    filter: "none",
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

          {zones.map((zone) => (
            <filter
              key={zone.id}
              id={`bb-glow-${zone.id}`}
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
            >
              <feGaussianBlur stdDeviation="5" result="blur1" />
              <feGaussianBlur stdDeviation="12" result="blur2" />
              <feMerge>
                <feMergeNode in="blur2" />
                <feMergeNode in="blur1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>

        <ellipse cx="200" cy="660" rx="100" ry="25" fill="url(#bb-bg-glow)" />

        <g strokeLinecap="round" strokeLinejoin="round" strokeWidth="5">
          <circle
            cx="200"
            cy="110"
            r="45"
            style={zoneStyle(head, zoneScores.head)}
          />

          <path
            d="M 140 185
               Q 200 170 260 185
               L 250 270
               Q 200 275 150 270 Z"
            style={zoneStyle(upperTorso, zoneScores.upperTorso)}
          />

          <path
            d="M 151 280
               Q 200 285 249 280
               L 247 360
               Q 200 365 153 360 Z"
            style={zoneStyle(midTorso, zoneScores.midTorso)}
          />

          <path
            d="M 154 370
               Q 200 375 246 370
               L 245 420
               Q 200 450 155 420 Z"
            style={zoneStyle(lowerTorso, zoneScores.lowerTorso)}
          />

          <path
            d="M 115 205
               Q 135 320 115 425
               A 15 15 0 0 1 85 420
               Q 100 310 93 210
               A 15 15 0 0 1 115 205 Z"
            style={zoneStyle(arms, zoneScores.arms)}
          />

          <path
            d="M 285 205
               Q 265 320 285 425
               A 15 15 0 0 0 315 420
               Q 300 310 307 210
               A 15 15 0 0 0 285 205 Z"
            style={zoneStyle(arms, zoneScores.arms)}
          />

          <path
            d="M 143 435
               L 178 435
               Q 175 550 185 660
               A 22 22 0 0 1 138 660
               Q 150 540 143 435 Z"
            style={zoneStyle(legs, zoneScores.legs)}
          />

          <path
            d="M 222 435
               L 257 435
               Q 250 540 262 660
               A 22 22 0 0 1 215 660
               Q 225 550 222 435 Z"
            style={zoneStyle(legs, zoneScores.legs)}
          />
        </g>
      </svg>

      <div className="zone-list">
        {zones.map((zone) => {
          const score = zoneScores[zone.id] || 0;

          return (
            <div
              className={`zone-chip ${score > 0 ? "lit" : ""}`}
              key={zone.id}
              style={{ "--zone-color": zone.color }}
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