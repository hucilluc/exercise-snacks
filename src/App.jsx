import { useEffect, useMemo, useState } from "react";
import Header from "./components/Header";
import BodyBrightFigure from "./components/BodyBrightFigure";
import ExerciseCard from "./components/ExerciseCard";
import ExerciseDetailModal from "./components/ExerciseDetailModal";
import {
  bodyBright,
  defaultDailyExerciseIds,
  enrichedExerciseLibrary,
} from "./data/exercises";
import "./styles.css";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STORAGE_KEY = "exerciseSnackProfile_v1";

const defaultStates = enrichedExerciseLibrary.reduce((acc, exercise) => {
  acc[exercise.id] = "not_started";
  return acc;
}, {});

function loadSavedProfile() {
  try {
    const savedProfile = window.localStorage.getItem(STORAGE_KEY);

    if (!savedProfile) {
      return null;
    }

    return JSON.parse(savedProfile);
  } catch {
    return null;
  }
}

function getSwapOptions(exerciseId, currentDailyIds) {
  const currentExercise = enrichedExerciseLibrary.find((exercise) => exercise.id === exerciseId);

  if (!currentExercise) {
    return [];
  }

  const currentSlotIndex = currentDailyIds.indexOf(exerciseId);
  const originalExerciseId = defaultDailyExerciseIds[currentSlotIndex];

  if (!originalExerciseId) {
    return [];
  }

  return enrichedExerciseLibrary.filter(
    (exercise) =>
      exercise.status === "active" &&
      exercise.domain === currentExercise.domain &&
      !currentDailyIds.some((id, index) => index !== currentSlotIndex && id === exercise.id)
  );
}

function App() {
  const todayIndex = 3;
  const savedProfile = loadSavedProfile();

  const [selectedDay, setSelectedDay] = useState(savedProfile?.selectedDay ?? todayIndex);
  const [cardStates, setCardStates] = useState(savedProfile?.cardStates ?? defaultStates);
  const [dailyExerciseIds, setDailyExerciseIds] = useState(
    savedProfile?.dailyExerciseIds ?? defaultDailyExerciseIds
  );
  const [selectedExerciseId, setSelectedExerciseId] = useState(null);

  const dailyExercises = dailyExerciseIds
    .map((id) => enrichedExerciseLibrary.find((exercise) => exercise.id === id))
    .filter(Boolean);

  const selectedExercise = enrichedExerciseLibrary.find(
    (exercise) => exercise.id === selectedExerciseId
  );
  const selectedExerciseState = selectedExercise ? cardStates[selectedExercise.id] : "not_started";

  useEffect(() => {
    const profile = {
      schemaVersion: 1,
      selectedDay,
      cardStates,
      dailyExerciseIds,
      lastUpdated: new Date().toISOString(),
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [selectedDay, cardStates, dailyExerciseIds]);

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
  }, [cardStates, dailyExercises]);

  function handleSetState(exerciseId, nextState) {
    setCardStates((currentStates) => ({
      ...currentStates,
      [exerciseId]: nextState,
    }));
  }

  function handleOpenExercise(exerciseId) {
    setSelectedExerciseId(exerciseId);
  }

  function handleCloseExercise() {
    setSelectedExerciseId(null);
  }

  function handleSwapExercise(exerciseId) {
    setDailyExerciseIds((currentIds) => {
      const currentSlotIndex = currentIds.indexOf(exerciseId);

      if (currentSlotIndex === -1) {
        return currentIds;
      }

      const swapOptions = getSwapOptions(exerciseId, currentIds);

      if (swapOptions.length <= 1) {
        return currentIds;
      }

      const currentOptionIndex = swapOptions.findIndex((exercise) => exercise.id === exerciseId);
      const nextOptionIndex = (currentOptionIndex + 1) % swapOptions.length;
      const replacement = swapOptions[nextOptionIndex];

      setCardStates((currentStates) => ({
        ...currentStates,
        [exerciseId]: "not_started",
        [replacement.id]: "not_started",
      }));

      if (selectedExerciseId === exerciseId) {
        setSelectedExerciseId(replacement.id);
      }

      return currentIds.map((id, index) =>
        index === currentSlotIndex ? replacement.id : id
      );
    });
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
                onOpen={handleOpenExercise}
                onSwap={handleSwapExercise}
              />
            ))}
          </div>
        </section>
      </section>

      <ExerciseDetailModal
        exercise={selectedExercise}
        isOpen={Boolean(selectedExercise)}
        state={selectedExerciseState}
        onSetState={handleSetState}
        onClose={handleCloseExercise}
      />
    </main>
  );
}

export default App;