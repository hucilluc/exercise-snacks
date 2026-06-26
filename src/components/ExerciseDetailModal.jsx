import { useEffect, useRef } from "react";
import { domainLabels } from "../data/bodyBright";
import { contextLabel } from "../storage";

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

const contextIcons = {
  getting_up: "🌅",
  kitchen: "☕",
  outdoors: "🚶",
  sitting_break: "💺",
  daytime: "🕒",
  scheduled: "📅",
};

function formatTag(tag) {
  return tag.replaceAll("_", " ");
}

export default function ExerciseDetailModal({
  card,
  exercise,
  isOpen,
  zoneColor,
  weekDates = [],
  dayNames = [],
  selectedDate,
  onSetState,
  onSetNote,
  onSwap,
  onMove,
  onClose,
}) {
  const backdropRef = useRef(null);

  // Keep the overlay fitted to the visual viewport — the area actually
  // visible above the iOS keyboard. Without this, opening the keyboard
  // shrinks the visible area and pushes the whole card (and its close
  // button) up off the top of the screen. Also locks the page behind so it
  // can't scroll instead of the card.
  useEffect(() => {
    if (!isOpen) return undefined;

    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    const backdrop = backdropRef.current;
    const vv = window.visualViewport;

    function sync() {
      if (!backdrop || !vv) return;
      backdrop.style.top = `${vv.offsetTop}px`;
      backdrop.style.left = `${vv.offsetLeft}px`;
      backdrop.style.width = `${vv.width}px`;
      backdrop.style.height = `${vv.height}px`;
    }

    if (vv) {
      sync();
      vv.addEventListener("resize", sync);
      vv.addEventListener("scroll", sync);
    }

    return () => {
      body.style.overflow = previousOverflow;
      if (vv) {
        vv.removeEventListener("resize", sync);
        vv.removeEventListener("scroll", sync);
      }
      if (backdrop) {
        backdrop.style.top = "";
        backdrop.style.left = "";
        backdrop.style.width = "";
        backdrop.style.height = "";
      }
    };
  }, [isOpen]);

  if (!isOpen || !card || !exercise) {
    return null;
  }

  const dose = card.dosePresented?.displayText ?? "";
  const contextIcon = contextIcons[card.contextPresented] || "•";

  return (
    <div className="modal-backdrop" ref={backdropRef} onClick={onClose}>
      <div
        className="exercise-modal"
        style={{ "--card-accent": zoneColor || "#22d3ee" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-topbar">
          <button
            className="modal-close"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="modal-header">
          <span className="context-badge">
            {contextIcon} {contextLabel(card.contextPresented)}
          </span>
          <span className="domain-label">
            {domainLabels[card.domainPresented]}
          </span>
        </div>

        <h2>{card.exerciseNamePresented}</h2>

        <div className="modal-image">
          <img
            src={`/images/${exercise.illustrationId}.png`}
            alt=""
            aria-hidden="true"
          />
        </div>

        <div className="modal-state-panel">
          <p>State: {stateLabels[card.state]}</p>

          <div className="state-buttons modal-state-buttons">
            {stateButtons.map((button) => (
              <button
                className={`state-button ${
                  card.state === button.state ? "active" : ""
                }`}
                key={button.state}
                type="button"
                onClick={() => onSetState(card.cardId, button.state)}
              >
                {button.label}
              </button>
            ))}
          </div>

          <button
            className="secondary-button modal-swap-button"
            type="button"
            onClick={() => onSwap(card.cardId)}
          >
            Swap exercise
          </button>

          {onMove && weekDates.length > 0 && (
            <div className="move-day-section">
              <p className="move-day-label">Move to another day</p>
              <div className="move-day-row">
                {weekDates.map((date, index) => (
                  <button
                    className="day-pill move-day-pill"
                    type="button"
                    key={date}
                    disabled={date === selectedDate}
                    onClick={() => onMove(card.cardId, date)}
                  >
                    {dayNames[index]}
                  </button>
                ))}
              </div>
            </div>
          )}
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
          <h3>Note</h3>
          <textarea
            className="card-note-field"
            placeholder="Optional — how did it go? e.g. too tired for the full walk"
            rows={3}
            value={card.note ?? ""}
            onChange={(event) => onSetNote(card.cardId, event.target.value)}
          />
        </div>

        <div className="modal-section">
          <h3>Tags</h3>
          <div className="tag-row">
            {exercise.functionalTags.map((tag) => (
              <span key={tag}>{formatTag(tag)}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
