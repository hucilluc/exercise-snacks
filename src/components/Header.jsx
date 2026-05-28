export default function Header() {
  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">Exercise Snack</p>
        <h1>Today’s movement menu</h1>
      </div>

      <div className="week-strip" aria-label="Week days">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, index) => (
          <button
            key={day}
            className={index === 3 ? "day-pill active" : "day-pill"}
            type="button"
          >
            {day}
          </button>
        ))}
      </div>
    </header>
  );
}
