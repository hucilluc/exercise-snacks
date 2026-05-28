import { useMemo, useState } from "react";
import Header from "./components/Header.jsx";
import BodyBrightFigure from "./components/BodyBrightFigure.jsx";
import ExerciseCard from "./components/ExerciseCard.jsx";
import { dailyExercises } from "./data/exercises.js";

export default function App() {
  const [completed, setCompleted] = useState([]);

  const completedZones = useMemo(() => {
    return dailyExercises
      .filter((exercise) => completed.includes(exercise.id))
      .map((exercise) => exercise.zone);
  }, [completed]);

  function toggleDone(id) {
    setCompleted((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  return (
    <main className="app-shell">
      <Header />

      <section className="layout">
        <BodyBrightFigure completedZones={completedZones} />

        <section className="daily-panel">
          <div className="panel-heading">
            <p className="eyebrow">Six gentle prompts</p>
            <h2>Small enough to start</h2>
          </div>

          <div className="cards-grid">
            {dailyExercises.map((exercise) => (
              <ExerciseCard
                key={exercise.id}
                exercise={exercise}
                isDone={completed.includes(exercise.id)}
                onDone={toggleDone}
              />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
