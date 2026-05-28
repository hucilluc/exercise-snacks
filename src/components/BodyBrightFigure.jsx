export default function BodyBrightFigure() {
  return (
    <div className="body-bright-figure">
      <svg viewBox="0 0 400 700" role="img" aria-label="Body Bright figure">
        <defs>
          <radialGradient id="bb-bg-glow" cx="50%" cy="95%" r="40%">
            <stop offset="0%" stopColor="#0c2511" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#090d16" stopOpacity="0" />
          </radialGradient>

          {["purple", "cyan", "yellow", "blue", "orange", "green"].map((name) => (
            <filter
              key={name}
              id={`bb-glow-${name}`}
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

        <ellipse
          cx="200"
          cy="660"
          rx="100"
          ry="25"
          fill="url(#bb-bg-glow)"
        />

        <g strokeLinecap="round" strokeLinejoin="round">
          <circle
            cx="200"
            cy="110"
            r="45"
            fill="#8a1dff"
            fillOpacity="0.9"
            stroke="#df8aff"
            strokeWidth="5"
            filter="url(#bb-glow-purple)"
          />

          <path
            d="M 140 185
               Q 200 170 260 185
               L 250 270
               Q 200 275 150 270 Z"
            fill="#18dff0"
            fillOpacity="0.9"
            stroke="#7bf0ff"
            strokeWidth="5"
            filter="url(#bb-glow-cyan)"
          />

          <path
            d="M 151 280
               Q 200 285 249 280
               L 247 360
               Q 200 365 153 360 Z"
            fill="#ffe100"
            fillOpacity="0.9"
            stroke="#ffee6b"
            strokeWidth="5"
            filter="url(#bb-glow-yellow)"
          />

          <path
            d="M 154 370
               Q 200 375 246 370
               L 245 420
               Q 200 450 155 420 Z"
            fill="#005dff"
            fillOpacity="0.9"
            stroke="#387cff"
            strokeWidth="5"
            filter="url(#bb-glow-blue)"
          />

          <path
            d="M 115 205
               Q 135 320 115 425
               A 15 15 0 0 1 85 420
               Q 100 310 93 210
               A 15 15 0 0 1 115 205 Z"
            fill="#ff5a1f"
            fillOpacity="0.9"
            stroke="#ff8742"
            strokeWidth="5"
            filter="url(#bb-glow-orange)"
          />

          <path
            d="M 285 205
               Q 265 320 285 425
               A 15 15 0 0 0 315 420
               Q 300 310 307 210
               A 15 15 0 0 0 285 205 Z"
            fill="#ff5a1f"
            fillOpacity="0.9"
            stroke="#ff8742"
            strokeWidth="5"
            filter="url(#bb-glow-orange)"
          />

          <path
            d="M 143 435
               L 178 435
               Q 175 550 185 660
               A 22 22 0 0 1 138 660
               Q 150 540 143 435 Z"
            fill="#1eff3c"
            fillOpacity="0.9"
            stroke="#6eff89"
            strokeWidth="5"
            filter="url(#bb-glow-green)"
          />

          <path
            d="M 222 435
               L 257 435
               Q 250 540 262 660
               A 22 22 0 0 1 215 660
               Q 225 550 222 435 Z"
            fill="#1eff3c"
            fillOpacity="0.9"
            stroke="#6eff89"
            strokeWidth="5"
            filter="url(#bb-glow-green)"
          />
        </g>
      </svg>
    </div>
  );
}