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

function getCurrentDose(exercise) {
  return (
    exercise.doseLevels.find((dose) => dose.level === exercise.currentDoseLevel)?.displayText ||
    exercise.dose ||
    ""
  );
}

export default function ExerciseDetailModal({
  exercise,
  isOpen,
  state,
  onSetState,
  onClose,
}) {
  if (!isOpen || !exercise) {
    return null;
  }

  const currentState = state || "not_started";
  const dose = getCurrentDose(exercise);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="exercise-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="modal-close"
          type="button"
          onClick={onClose}
        >
          ×
        </button>

        <div className="modal-header">
          <span className="context-badge">{exercise.context}</span>
          <span className="domain-label">{exercise.domainLabel}</span>
        </div>

        <h2>{exercise.name}</h2>

        <div className="modal-image">
          <img
            src={exercise.imageSrc}
            alt=""
            aria-hidden="true"
          />
        </div>

        <div className="modal-state-panel">
          <p>State: {stateLabels[currentState]}</p>

          <div className="state-buttons modal-state-buttons">
            {stateButtons.map((button) => (
              <button
                className={`state-button ${
                  currentState === button.state ? "active" : ""
                }`}
                key={button.state}
                type="button"
                onClick={() => onSetState(exercise.id, button.state)}
              >
                {button.label}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-section">
          <h3>Suggested dose</h3>
          <p>{dose}</p>
        </div>

        <div className="modal-section">
          <h3>Instructions</h3>
          <p>{exercise.instructions}</p>
        </div>

        <div className="modal-section">
          <h3>Tags</h3>
          <div className="tag-row">
            {exercise.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}