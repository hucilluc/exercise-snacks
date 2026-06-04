import { useState } from "react";

const stateLabels = {
  not_started: "Not started",
  done: "Done",
  tried: "Tried",
  skip: "Skip",
  not_suitable: "Not suitable",
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
          <div className="compact-card-meta">
            <span>{exercise.context}</span>
            <span>{exercise.domainLabel}</span>
          </div>

          <h3>{exercise.name}</h3>
          <p className="dose">{dose}</p>
          <p className="state-line">{stateLabels[currentState]}</p>
        </div>
      </button>

      <div className="compact-card-actions">
        <button
          className={`state-button quick-state ${currentState === "done" ? "active" : ""}`}
          type="button"
          onClick={() => onSetState(exercise.id, "done")}
        >
          Done
        </button>

        <button
          className={`state-button quick-state ${currentState === "tried" ? "active" : ""}`}
          type="button"
          onClick={() => onSetState(exercise.id, "tried")}
        >
          Tried
        </button>
      </div>
    </article>
  );
}