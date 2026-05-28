export default function ExerciseCard({ exercise, isDone, onDone }) {
  return (
    <article className={isDone ? "exercise-card done" : "exercise-card"}>
      <div className="card-topline">
        <span className="context-badge">{exercise.context}</span>
        <span className="domain-label">{exercise.domain}</span>
      </div>

      <div className="exercise-main">
        <div className="exercise-illustration" aria-hidden="true">
          <svg viewBox="0 0 80 80">
            <circle cx="40" cy="18" r="9" />
            <path d="M40 29 L40 52" />
            <path d="M26 38 L54 38" />
            <path d="M40 52 L28 70" />
            <path d="M40 52 L52 70" />
          </svg>
        </div>

        <div>
          <h3>{exercise.title}</h3>
          <p className="dose">{exercise.dose}</p>
        </div>
      </div>

      <div className="tag-row">
        {exercise.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>

      <div className="card-actions">
        <button className="secondary-button" type="button">
          Swap
        </button>
        <button className="complete-button" type="button" onClick={() => onDone(exercise.id)}>
          {isDone ? "Done ✓" : "Completed"}
        </button>
      </div>
    </article>
  );
}
