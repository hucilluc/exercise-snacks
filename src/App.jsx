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

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function getMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, amount) {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function getCurrentWeekDates() {
  const monday = getMonday();
  return days.map((_, index) => toISODate(addDays(monday, index)));
}

function getTodayIndex(weekDates) {
  const today = toISODate(new Date());
  const index = weekDates.indexOf(today);
  return index === -1 ? 0 : index;
}

function findExercise(exerciseId) {
  return enrichedExerciseLibrary.find((exercise) => exercise.id === exerciseId);
}

function createDayRecord(date) {
  return {
    date,
    slots: defaultDailyExerciseIds.map((exerciseId, index) => ({
      slotId: `${date}-slot-${index + 1}`,
      exerciseId,
      originalExerciseId: exerciseId,
      state: "not_started",
    })),
  };
}

function createWeekRecords(weekDates) {
  return weekDates.reduce((acc, date) => {
    acc[date] = createDayRecord(date);
    return acc;
  }, {});
}

function loadSavedProfile(weekDates) {
  try {
    const savedProfile = window.localStorage.getItem(STORAGE_KEY);

    if (!savedProfile) {
      return null;
    }

    const parsed = JSON.parse(savedProfile);

    if (parsed.schemaVersion === 2 && parsed.dayRecords) {
      return parsed;
    }

    if (parsed.schemaVersion === 1) {
      const migratedDayRecords = createWeekRecords(weekDates);
      const selectedDay =
        typeof parsed.selectedDay === "number" ? parsed.selectedDay : getTodayIndex(weekDates);
      const selectedDate = weekDates[selectedDay] ?? weekDates[getTodayIndex(weekDates)];
      const migratedExerciseIds = parsed.dailyExerciseIds ?? defaultDailyExerciseIds;
      const migratedStates = parsed.cardStates ?? {};

      migratedDayRecords[selectedDate] = {
        date: selectedDate,
        slots: migratedExerciseIds.map((exerciseId, index) => ({
          slotId: `${selectedDate}-slot-${index + 1}`,
          exerciseId,
          originalExerciseId: defaultDailyExerciseIds[index] ?? exerciseId,
          state: migratedStates[exerciseId] ?? "not_started",
        })),
      };

      return {
        schemaVersion: 2,
        selectedDate,
        dayRecords: migratedDayRecords,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function ensureCurrentWeekRecords(savedProfile, weekDates) {
  const defaultRecords = createWeekRecords(weekDates);
  const savedRecords = savedProfile?.dayRecords ?? {};

  return weekDates.reduce((acc, date) => {
    acc[date] = savedRecords[date] ?? defaultRecords[date];
    return acc;
  }, {});
}

function getSwapOptions(slot, currentSlots) {
  const currentExercise = findExercise(slot.exerciseId);

  if (!currentExercise) {
    return [];
  }

  return enrichedExerciseLibrary.filter(
    (exercise) =>
      exercise.status === "active" &&
      exercise.domain === currentExercise.domain &&
      !currentSlots.some(
        (otherSlot) =>
          otherSlot.slotId !== slot.slotId && otherSlot.exerciseId === exercise.id
      )
  );
}

function App() {
  const weekDates = useMemo(() => getCurrentWeekDates(), []);
  const todayIndex = getTodayIndex(weekDates);
  const savedProfile = useMemo(() => loadSavedProfile(weekDates), [weekDates]);

  const [selectedDay, setSelectedDay] = useState(() => {
    const savedIndex = savedProfile?.selectedDate
      ? weekDates.indexOf(savedProfile.selectedDate)
      : -1;

    return savedIndex === -1 ? todayIndex : savedIndex;
  });

  const [dayRecords, setDayRecords] = useState(() =>
    ensureCurrentWeekRecords(savedProfile, weekDates)
  );

  const [selectedSlotId, setSelectedSlotId] = useState(null);

  const selectedDate = weekDates[selectedDay];
  const selectedDayRecord = dayRecords[selectedDate] ?? createDayRecord(selectedDate);

  const dailyCards = selectedDayRecord.slots
    .map((slot) => {
      const exercise = findExercise(slot.exerciseId);

      if (!exercise) {
        return null;
      }

      return {
        ...exercise,
        id: slot.slotId,
        exerciseId: exercise.id,
        slotId: slot.slotId,
        state: slot.state,
      };
    })
    .filter(Boolean);

  const selectedSlot = selectedDayRecord.slots.find(
    (slot) => slot.slotId === selectedSlotId
  );

  const selectedExerciseBase = selectedSlot ? findExercise(selectedSlot.exerciseId) : null;

  const selectedExercise = selectedExerciseBase
    ? {
        ...selectedExerciseBase,
        id: selectedSlot.slotId,
        exerciseId: selectedExerciseBase.id,
        slotId: selectedSlot.slotId,
      }
    : null;

  const selectedExerciseState = selectedSlot?.state ?? "not_started";

  useEffect(() => {
    const profile = {
      schemaVersion: 2,
      selectedDate,
      dayRecords,
      lastUpdated: new Date().toISOString(),
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [selectedDate, dayRecords]);

  const zoneScores = useMemo(() => {
    const scores = {
      head: 0,
      upperTorso: 0,
      midTorso: 0,
      lowerTorso: 0,
      arms: 0,
      legs: 0,
    };

    Object.values(dayRecords).forEach((dayRecord) => {
      dayRecord.slots.forEach((slot) => {
        const exercise = findExercise(slot.exerciseId);

        if (!exercise) {
          return;
        }

        const score = bodyBright.stateScores[slot.state] ?? 0;
        const zone = bodyBright.domainToZone[exercise.domain];

        if (zone) {
          scores[zone] += score;
        }
      });
    });

    return scores;
  }, [dayRecords]);

  function handleSetState(slotId, nextState) {
    setDayRecords((currentRecords) => ({
      ...currentRecords,
      [selectedDate]: {
        ...currentRecords[selectedDate],
        slots: currentRecords[selectedDate].slots.map((slot) =>
          slot.slotId === slotId
            ? {
                ...slot,
                state: slot.state === nextState ? "not_started" : nextState,
              }
            : slot
        ),
      },
    }));
  }

  function handleOpenExercise(slotId) {
    setSelectedSlotId(slotId);
  }

  function handleCloseExercise() {
    setSelectedSlotId(null);
  }

  function handleSwapExercise(slotId) {
    setDayRecords((currentRecords) => {
      const currentDayRecord = currentRecords[selectedDate];
      const currentSlot = currentDayRecord.slots.find((slot) => slot.slotId === slotId);

      if (!currentSlot) {
        return currentRecords;
      }

      const swapOptions = getSwapOptions(currentSlot, currentDayRecord.slots);

      if (swapOptions.length <= 1) {
        return currentRecords;
      }

      const currentOptionIndex = swapOptions.findIndex(
        (exercise) => exercise.id === currentSlot.exerciseId
      );
      const nextOptionIndex = (currentOptionIndex + 1) % swapOptions.length;
      const replacement = swapOptions[nextOptionIndex];

      return {
        ...currentRecords,
        [selectedDate]: {
          ...currentDayRecord,
          slots: currentDayRecord.slots.map((slot) =>
            slot.slotId === slotId
              ? {
                  ...slot,
                  exerciseId: replacement.id,
                  state: "not_started",
                }
              : slot
          ),
        },
      };
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
            onClick={() => {
              setSelectedDay(index);
              setSelectedSlotId(null);
            }}
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
            {dailyCards.map((exercise) => (
              <ExerciseCard
                exercise={exercise}
                key={exercise.slotId}
                state={exercise.state}
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