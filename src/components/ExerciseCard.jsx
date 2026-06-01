const stateLabels = {
  not_started: "Not started",
  done: "Done",
  tried: "Tried",
  skip: "Skip",
  not_suitable: "Not suitable",
};

const stateButtons = [
  { state: "done", label: "Done" },
  { state: "tried", label: "Tried" },
  { state: "skip", label: "Skip" },
  { state: "not_suitable", label: "Not suitable" },
];

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

export default function ExerciseCard({ exercise, state, onSetState }) {
  const currentState = state || "not_started";
  const dose = getCurrentDose(exercise);

  return (
    <article className={`exercise-card ${currentState}`}>
      <div className="card-topline">
        <span className="context-badge">{exercise.context}</span>
        <span className="domain-label">{exercise.domainLabel}</span>
      </div>

      <div className="exercise-main">
        <div className="exercise-illustration">
          <PlaceholderIllustration />
        </div>

        <div>
          <h3>{exercise.name}</h3>
          <p className="dose">{dose}</p>
          <p className="state-line">State: {stateLabels[currentState]}</p>
        </div>
      </div>

      <div className="tag-row">
        {exercise.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>

      <div className="card-actions multi-actions">
        <button className="secondary-button" type="button">
          Swap
        </button>

        <div className="state-buttons">
          {stateButtons.map((button) => (
            <button
              className={`state-button ${currentState === button.state ? "active" : ""}`}
              key={button.state}
              type="button"
              onClick={() => onSetState(exercise.id, button.state)}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}