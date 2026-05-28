import { zoneLabels } from "../data/exercises.js";

const zoneColors = {
  head: "#9b2cff",
  arms: "#ff5a24",
  upperTorso: "#16e8f0",
  midTorso: "#ffe12b",
  lowerTorso: "#0878ff",
  legs: "#19ff6a",
};

export default function BodyBrightFigure({ completedZones }) {
  const isBright = (zone) => completedZones.includes(zone);

  const zoneClass = (zone) =>
    isBright(zone) ? "symbol-zone bright" : "symbol-zone";

  const glow = (zone) => (isBright(zone) ? `url(#glow-${zone})` : "none");

  return (
    <section className="body-panel">
      <div className="panel-heading">
        <p className="eyebrow">Body Bright</p>
        <h2>Light up the day</h2>
      </div>

      <svg
        className="body-svg symbolic-body"
        viewBox="0 0 220 420"
        role="img"
        aria-label="Body Bright progress figure"
      >
        <defs>
          {Object.entries(zoneColors).map(([zone, color]) => (
            <filter key={zone} id={`glow-${zone}`}>
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feFlood floodColor={color} floodOpacity="0.8" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}

          <linearGradient id="body-dim" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#26364f" />
            <stop offset="100%" stopColor="#101827" />
          </linearGradient>
        </defs>

        <g className="body-shadow">
          <ellipse cx="110" cy="390" rx="64" ry="12" />
        </g>

        <circle
          className={zoneClass("head")}
          style={{
            "--zone-color": zoneColors.head,
            filter: glow("head"),
          }}
          cx="110"
          cy="48"
          r="34"
        />

        <rect
          className={zoneClass("upperTorso")}
          style={{
            "--zone-color": zoneColors.upperTorso,
            filter: glow("upperTorso"),
          }}
          x="66"
          y="104"
          width="88"
          height="74"
          rx="22"
        />

        <rect
          className={zoneClass("midTorso")}
          style={{
            "--zone-color": zoneColors.midTorso,
            filter: glow("midTorso"),
          }}
          x="64"
          y="181"
          width="92"
          height="76"
          rx="18"
        />

        <rect
          className={zoneClass("lowerTorso")}
          style={{
            "--zone-color": zoneColors.lowerTorso,
            filter: glow("lowerTorso"),
          }}
          x="68"
          y="260"
          width="84"
          height="42"
          rx="18"
        />

        <rect
          className={zoneClass("arms")}
          style={{
            "--zone-color": zoneColors.arms,
            filter: glow("arms"),
          }}
          x="27"
          y="119"
          width="35"
          height="158"
          rx="18"
        />

        <rect
          className={zoneClass("arms")}
          style={{
            "--zone-color": zoneColors.arms,
            filter: glow("arms"),
          }}
          x="158"
          y="119"
          width="35"
          height="158"
          rx="18"
        />

        <rect
          className={zoneClass("legs")}
          style={{
            "--zone-color": zoneColors.legs,
            filter: glow("legs"),
          }}
          x="68"
          y="305"
          width="37"
          height="82"
          rx="18"
        />

        <rect
          className={zoneClass("legs")}
          style={{
            "--zone-color": zoneColors.legs,
            filter: glow("legs"),
          }}
          x="115"
          y="305"
          width="37"
          height="82"
          rx="18"
        />
      </svg>

      <div className="zone-list">
        {Object.entries(zoneLabels).map(([zone, label]) => (
          <div key={zone} className={isBright(zone) ? "zone-chip lit" : "zone-chip"}>
            <span style={{ "--zone-color": zoneColors[zone] }} />
            {label}
          </div>
        ))}
      </div>
    </section>
  );
}