import { useState } from "react";
import { contextLabel } from "../storage";

const contextIcons = {
  getting_up: "🌅",
  kitchen: "☕",
  outdoors: "🚶",
  sitting_break: "💺",
  daytime: "🕒",
  scheduled: "📅",
};

function PlaceholderIllustration() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="12" r="6" />
      <path d="M32 20v24" />
      <path d="M20 30h24" />
      <path d="M32 44l-10 12" />
      <path d="M32 44l10 12" />
    </svg>
  );
}

export default function ExerciseCard({
  card,
  exercise,
  zoneColor,
  onSetState,
  onOpen,
}) {
  const [imageFailed, setImageFailed] = useState(false);

  const imageSrc = `/images/${exercise.illustrationId}.png`;
  const showImage = !imageFailed;
  const dose = card.dosePresented?.displayText ?? "";
  const contextIcon = contextIcons[card.contextPresented] || "•";

  return (
    <article
      className={`exercise-card compact-exercise-card ${card.state}`}
      style={{ "--card-accent": zoneColor || "#22d3ee" }}
    >
      <button
        className="compact-card-main"
        type="button"
        onClick={() => onOpen(card.cardId)}
      >
        <div className={`exercise-illustration ${showImage ? "has-image" : ""}`}>
          {showImage ? (
            <img
              src={imageSrc}
              alt=""
              aria-hidden="true"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <PlaceholderIllustration />
          )}
        </div>

        <div className="compact-card-text">
          <h3>{card.exerciseNamePresented}</h3>
          <p className="dose">{dose}</p>

          <div className="compact-card-actions">
            <button
              className={`state-button quick-state ${
                card.state === "done" ? "active" : ""
              }`}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSetState(card.cardId, "done");
              }}
            >
              Done
            </button>

            <button
              className={`state-button quick-state ${
                card.state === "tried" ? "active" : ""
              }`}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSetState(card.cardId, "tried");
              }}
            >
              Tried
            </button>
          </div>
        </div>

        <span
          className="card-context-icon"
          aria-label={contextLabel(card.contextPresented)}
        >
          {contextIcon}
        </span>
      </button>
    </article>
  );
}
