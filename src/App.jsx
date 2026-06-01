import { useMemo, useState } from "react";
import Header from "./components/Header";
import BodyBrightFigure from "./components/BodyBrightFigure";
import ExerciseCard from "./components/ExerciseCard";
import { bodyBright, dailyExercises } from "./data/exercises";
import "./styles.css";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const defaultStates = dailyExercises.reduce((acc, exercise) => {
  acc[exercise.id] = "not_started";
  return acc;
}, {});

function App() {
  const todayIndex = 3;
  const [selectedDay, setSelectedDay] = useState(todayIndex);
  const [cardStates, setCardStates] = useState(defaultStates);

  const zoneScores = useMemo(() => {
    const scores = {
      head: 0,
      upperTorso: 0,
      midTorso: 0,
      lowerTorso: 0,
      arms: 0,
      legs: 0,
    };

    dailyExercises.forEach((exercise) => {
      const state = cardStates[exercise.id];
      const score = bodyBright.stateScores[state] ?? 0;
      const zone = bodyBright.domainToZone[exercise.domain];

      if (zone) {
        scores[zone] += score;
      }
    });

    return scores;
  }, [cardStates]);

  function handleSetState(exerciseId, nextState) {
    setCardStates((currentStates) => ({
      ...currentStates,
      [exerciseId]: nextState,
    }));
  }

  return (
    <main className="app-shell">
      <Header />

      <div className="week-strip" aria-label="Select day">
        {days.map((day, index) => (
          <button
            className={`day-pill ${selectedDay === index ? "active" : ""}`}
            key={day}
            type="button"
            onClick={() => setSelectedDay(index)}
          >
            {day}
          </button>
        ))}
      </div>

      <section className="layout">
        <aside className="body-panel" aria-label="Body Bright weekly progress">
          <BodyBrightFigure zoneScores={zoneScores} weeklyTarget={bodyBright.weeklyTarget} />
        </aside>

        <section className="daily-panel">
          <div className="panel-heading">
            <p className="eyebrow">Six gentle prompts</p>
            <h2>Small enough to start</h2>
          </div>

          <div className="cards-grid">
            {dailyExercises.map((exercise) => (
              <ExerciseCard
                exercise={exercise}
                key={exercise.id}
                state={cardStates[exercise.id]}
                onSetState={handleSetState}
              />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;