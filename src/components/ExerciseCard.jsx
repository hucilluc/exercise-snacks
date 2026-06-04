import { useState } from "react";

const contextIcons = {
  "Getting up": "🌅",
  Kitchen: "☕",
  Outdoors: "🚶",
  "Sitting break": "💺",
  Daytime: "🕒",
  Scheduled: "📅",
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

function getCurrentDose(exercise) {
  return (
    exercise.doseLevels.find((dose) => dose.level === exercise.currentDoseLevel)?.displayText ||
    exercise.dose ||
    ""
  );
}

export default function ExerciseCard({ exercise, state, onSetState, onOpen }) {
  const [imageFailed, setImageFailed] = useState(false);

  const currentState = state || "not_started";
  const dose = getCurrentDose(exercise);
  const showImage = exercise.imageSrc && !imageFailed;
  const contextIcon = contextIcons[exercise.context] || "•";

  return (
    <article
      className={`exercise-card compact-exercise-card ${currentState}`}
      style={{ "--card-accent": exercise.zoneColor || "#22d3ee" }}
    >
      <button
        className="compact-card-main"
        type="button"
        onClick={() => onOpen(exercise.id)}
      >
        <div className={`exercise-illustration ${showImage ? "has-image" : ""}`}>
          <span className="context-icon" aria-label={exercise.context}>
            {contextIcon}
          </span>

          {showImage ? (
            <img
              src={exercise.imageSrc}
              alt=""
              aria-hidden="true"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <PlaceholderIllustration />
          )}
        </div>

        <div className="compact-card-text">
          <h3>{exercise.name}</h3>
          <p className="dose">{dose}</p>

          <div className="compact-card-actions">
            <button
              className={`state-button quick-state ${
                currentState === "done" ? "active" : ""
              }`}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSetState(exercise.id, "done");
              }}
            >
              Done
            </button>

            <button
              className={`state-button quick-state ${
                currentState === "tried" ? "active" : ""
              }`}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSetState(exercise.id, "tried");
              }}
            >
              Tried
            </button>
          </div>
        </div>
      </button>
    </article>
  );
}