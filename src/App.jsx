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

const zoneColors = {
  head: "#8a1dff",
  upperTorso: "#18dff0",
  midTorso: "#ffe100",
  lowerTorso: "#005dff",
  arms: "#ff5a1f",
  legs: "#1eff3c",
};

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseISODate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
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

function getWeekDates(weekStartDate) {
  return days.map((_, index) => toISODate(addDays(weekStartDate, index)));
}

function getTodayIndex(weekDates) {
  const today = toISODate(new Date());
  const index = weekDates.indexOf(today);
  return index === -1 ? 0 : index;
}

function getWeekStartISO(dateOrISO) {
  const date = typeof dateOrISO === "string" ? parseISODate(dateOrISO) : dateOrISO;
  return toISODate(getMonday(date));
}

function findExercise(exerciseId) {
  return enrichedExerciseLibrary.find((exercise) => exercise.id === exerciseId);
}

function getZoneColorForExercise(exercise) {
  const zone = bodyBright.domainToZone[exercise.domain];
  return zoneColors[zone] || "#22d3ee";
}

function emptyZoneScores() {
  return {
    head: 0,
    upperTorso: 0,
    midTorso: 0,
    lowerTorso: 0,
    arms: 0,
    legs: 0,
  };
}

function emptyStateCounts() {
  return {
    done: 0,
    tried: 0,
    skip: 0,
    not_suitable: 0,
  };
}

function createDayRecord(date, locked = false) {
  return {
    date,
    weekStart: getWeekStartISO(date),
    locked,
    slots: defaultDailyExerciseIds.map((exerciseId, index) => ({
      slotId: `${date}-slot-${index + 1}`,
      exerciseId,
      originalExerciseId: exerciseId,
      state: "not_started",
      swap: null,
    })),
  };
}

function createWeekRecords(weekDates) {
  return weekDates.reduce((acc, date) => {
    acc[date] = createDayRecord(date);
    return acc;
  }, {});
}

function calculateScoresForDates(dayRecords, weekDates) {
  const zoneScores = emptyZoneScores();
  const stateCounts = emptyStateCounts();

  weekDates.forEach((date) => {
    const dayRecord = dayRecords[date];

    if (!dayRecord) return;

    dayRecord.slots.forEach((slot) => {
      const exercise = findExercise(slot.exerciseId);

      if (!exercise) return;

      const score = bodyBright.stateScores[slot.state] ?? 0;
      const zone = bodyBright.domainToZone[exercise.domain];

      if (zone) {
        zoneScores[zone] += score;
      }

      if (Object.prototype.hasOwnProperty.call(stateCounts, slot.state)) {
        stateCounts[slot.state] += 1;
      }
    });
  });

  const totalCreditedScore = Object.values(zoneScores).reduce(
    (total, score) => total + score,
    0
  );

  return { zoneScores, stateCounts, totalCreditedScore };
}

function createWeeklySnapshot(weekStartISO, dayRecords, weekType = "active") {
  const weekStartDate = parseISODate(weekStartISO);
  const weekDates = getWeekDates(weekStartDate);
  const weekEnd = weekDates[6];

  const scores =
    weekType === "inactive"
      ? {
          zoneScores: emptyZoneScores(),
          stateCounts: emptyStateCounts(),
          totalCreditedScore: 0,
        }
      : calculateScoresForDates(dayRecords, weekDates);

  return {
    weekStart: weekStartISO,
    weekEnd,
    weekType,
    bodyBrightVersion: bodyBright.version ?? 1,
    zoneScores: scores.zoneScores,
    stateCounts: scores.stateCounts,
    totalCreditedScore: scores.totalCreditedScore,
    createdAt: new Date().toISOString(),
    locked: true,
  };
}

function inferSavedWeekStart(parsed, currentWeekStartISO) {
  if (parsed.currentWeek?.weekStart) {
    return parsed.currentWeek.weekStart;
  }

  if (parsed.selectedDate) {
    return getWeekStartISO(parsed.selectedDate);
  }

  const dates = Object.keys(parsed.dayRecords ?? {}).sort();

  if (dates.length > 0) {
    return getWeekStartISO(dates[0]);
  }

  return currentWeekStartISO;
}

function normaliseSavedProfile(parsed, currentWeekDates) {
  if (parsed.schemaVersion >= 3 && parsed.dayRecords) {
    return parsed;
  }

  if (parsed.schemaVersion === 2 && parsed.dayRecords) {
    return {
      schemaVersion: 3,
      currentWeek: {
        weekStart: inferSavedWeekStart(parsed, currentWeekDates[0]),
        selectedDate: parsed.selectedDate ?? currentWeekDates[getTodayIndex(currentWeekDates)],
        editable: true,
      },
      selectedDate: parsed.selectedDate ?? currentWeekDates[getTodayIndex(currentWeekDates)],
      dayRecords: parsed.dayRecords,
      weeklySnapshots: {},
    };
  }

  if (parsed.schemaVersion === 1) {
    const migratedDayRecords = createWeekRecords(currentWeekDates);
    const selectedDay =
      typeof parsed.selectedDay === "number"
        ? parsed.selectedDay
        : getTodayIndex(currentWeekDates);
    const selectedDate = currentWeekDates[selectedDay] ?? currentWeekDates[0];
    const migratedExerciseIds = parsed.dailyExerciseIds ?? defaultDailyExerciseIds;
    const migratedStates = parsed.cardStates ?? {};

    migratedDayRecords[selectedDate] = {
      date: selectedDate,
      weekStart: getWeekStartISO(selectedDate),
      locked: false,
      slots: migratedExerciseIds.map((exerciseId, index) => ({
        slotId: `${selectedDate}-slot-${index + 1}`,
        exerciseId,
        originalExerciseId: defaultDailyExerciseIds[index] ?? exerciseId,
        state: migratedStates[exerciseId] ?? "not_started",
        swap: null,
      })),
    };

    return {
      schemaVersion: 3,
      currentWeek: {
        weekStart: currentWeekDates[0],
        selectedDate,
        editable: true,
      },
      selectedDate,
      dayRecords: migratedDayRecords,
      weeklySnapshots: {},
    };
  }

  return null;
}

function loadSavedProfile(currentWeekDates) {
  try {
    const savedProfile = window.localStorage.getItem(STORAGE_KEY);

    if (!savedProfile) return null;

    const parsed = JSON.parse(savedProfile);
    return normaliseSavedProfile(parsed, currentWeekDates);
  } catch {
    return null;
  }
}

function rolloverProfile(savedProfile, currentWeekDates) {
  const currentWeekStartISO = currentWeekDates[0];

  if (!savedProfile) {
    return {
      schemaVersion: 3,
      currentWeek: {
        weekStart: currentWeekStartISO,
        selectedDate: currentWeekDates[getTodayIndex(currentWeekDates)],
        editable: true,
      },
      selectedDate: currentWeekDates[getTodayIndex(currentWeekDates)],
      dayRecords: createWeekRecords(currentWeekDates),
      weeklySnapshots: {},
    };
  }

  let dayRecords = { ...(savedProfile.dayRecords ?? {}) };
  const weeklySnapshots = { ...(savedProfile.weeklySnapshots ?? {}) };
  const savedWeekStartISO = inferSavedWeekStart(savedProfile, currentWeekStartISO);

  let cursor = parseISODate(savedWeekStartISO);
  const currentWeekStartDate = parseISODate(currentWeekStartISO);

  while (cursor < currentWeekStartDate) {
    const weekStartISO = toISODate(cursor);
    const weekDates = getWeekDates(cursor);

    const hasAnyDayRecord = weekDates.some((date) => dayRecords[date]);

    if (!weeklySnapshots[weekStartISO]) {
      weeklySnapshots[weekStartISO] = createWeeklySnapshot(
        weekStartISO,
        dayRecords,
        hasAnyDayRecord ? "active" : "inactive"
      );
    }

    weekDates.forEach((date) => {
      if (dayRecords[date]) {
        dayRecords[date] = {
          ...dayRecords[date],
          locked: true,
        };
      }
    });

    cursor = addDays(cursor, 7);
  }

  const currentWeekDefaults = createWeekRecords(currentWeekDates);

  currentWeekDates.forEach((date) => {
    dayRecords[date] = dayRecords[date] ?? currentWeekDefaults[date];
    dayRecords[date] = {
      ...dayRecords[date],
      locked: false,
      weekStart: currentWeekStartISO,
    };
  });

  const selectedDate = currentWeekDates.includes(savedProfile.selectedDate)
    ? savedProfile.selectedDate
    : currentWeekDates[getTodayIndex(currentWeekDates)];

  return {
    schemaVersion: 3,
    currentWeek: {
      weekStart: currentWeekStartISO,
      weekEnd: currentWeekDates[6],
      selectedDate,
      editable: true,
    },
    selectedDate,
    dayRecords,
    weeklySnapshots,
  };
}

function getSwapOptions(slot, currentSlots) {
  const currentExercise = findExercise(slot.exerciseId);

  if (!currentExercise) return [];

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

function formatWeekLabel(snapshot) {
  const start = parseISODate(snapshot.weekStart);
  const end = parseISODate(snapshot.weekEnd);

  const startLabel = start.toLocaleDateString("en-GB", {
    day: "numeric",
  });

  const endLabel = end.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

  return `${startLabel}–${endLabel}`;
}

function getMonthLabel(snapshot) {
  const start = parseISODate(snapshot.weekStart);

  return start.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function groupSnapshotsByMonth(weeklySnapshots) {
  const snapshots = Object.values(weeklySnapshots).sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart)
  );

  return snapshots.reduce((groups, snapshot) => {
    const label = getMonthLabel(snapshot);

    if (!groups[label]) {
      groups[label] = [];
    }

    groups[label].push(snapshot);
    return groups;
  }, {});
}

function App() {
  const currentWeekDates = useMemo(() => getWeekDates(getMonday()), []);
  const todayIndex = getTodayIndex(currentWeekDates);

  const initialProfile = useMemo(() => {
    const savedProfile = loadSavedProfile(currentWeekDates);
    return rolloverProfile(savedProfile, currentWeekDates);
  }, [currentWeekDates]);

  const [view, setView] = useState("today");
  const [selectedDay, setSelectedDay] = useState(() => {
    const savedIndex = currentWeekDates.indexOf(initialProfile.selectedDate);
    return savedIndex === -1 ? todayIndex : savedIndex;
  });

  const [dayRecords, setDayRecords] = useState(initialProfile.dayRecords);
  const [weeklySnapshots, setWeeklySnapshots] = useState(initialProfile.weeklySnapshots);
  const [selectedSlotId, setSelectedSlotId] = useState(null);

  const selectedDate = currentWeekDates[selectedDay];
  const selectedDayRecord = dayRecords[selectedDate] ?? createDayRecord(selectedDate);
  const historyGroups = useMemo(
    () => groupSnapshotsByMonth(weeklySnapshots),
    [weeklySnapshots]
  );

  const dailyCards = selectedDayRecord.slots
    .map((slot) => {
      const exercise = findExercise(slot.exerciseId);

      if (!exercise) return null;

      return {
        ...exercise,
        id: slot.slotId,
        exerciseId: exercise.id,
        slotId: slot.slotId,
        state: slot.state,
        zoneColor: getZoneColorForExercise(exercise),
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
        zoneColor: getZoneColorForExercise(selectedExerciseBase),
      }
    : null;

  const selectedExerciseState = selectedSlot?.state ?? "not_started";

  const zoneScores = useMemo(() => {
    return calculateScoresForDates(dayRecords, currentWeekDates).zoneScores;
  }, [dayRecords, currentWeekDates]);

  useEffect(() => {
    const profile = {
      schemaVersion: 3,
      currentWeek: {
        weekStart: currentWeekDates[0],
        weekEnd: currentWeekDates[6],
        selectedDate,
        editable: true,
      },
      selectedDate,
      dayRecords,
      weeklySnapshots,
      lastUpdated: new Date().toISOString(),
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [selectedDate, dayRecords, weeklySnapshots, currentWeekDates]);

  function handleSetState(slotId, nextState) {
    setDayRecords((currentRecords) => {
      const currentDayRecord = currentRecords[selectedDate];

      if (!currentDayRecord || currentDayRecord.locked) {
        return currentRecords;
      }

      return {
        ...currentRecords,
        [selectedDate]: {
          ...currentDayRecord,
          slots: currentDayRecord.slots.map((slot) =>
            slot.slotId === slotId
              ? {
                  ...slot,
                  state: slot.state === nextState ? "not_started" : nextState,
                }
              : slot
          ),
        },
      };
    });
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

      if (!currentDayRecord || currentDayRecord.locked) {
        return currentRecords;
      }

      const currentSlot = currentDayRecord.slots.find((slot) => slot.slotId === slotId);

      if (!currentSlot) return currentRecords;

      const swapOptions = getSwapOptions(currentSlot, currentDayRecord.slots);

      if (swapOptions.length <= 1) return currentRecords;

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
                  swap: {
                    wasSwapped: true,
                    swappedAt: new Date().toISOString(),
                    fromExerciseId: slot.exerciseId,
                    toExerciseId: replacement.id,
                  },
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

      <div className="view-toggle" aria-label="App section">
        <button
          className={`day-pill ${view === "today" ? "active" : ""}`}
          type="button"
          onClick={() => {
            setView("today");
            setSelectedDay(todayIndex);
            setSelectedSlotId(null);
          }}
        >
          Today
        </button>

        <button
          className={`day-pill ${view === "history" ? "active" : ""}`}
          type="button"
          onClick={() => {
            setView("history");
            setSelectedSlotId(null);
          }}
        >
          History
        </button>
      </div>

      {view === "today" ? (
        <>
          <div className="week-strip" aria-label="Select day">
            {days.map((day, index) => (
              <button
                className={`day-pill ${selectedDay === index ? "active" : ""} ${
                  todayIndex === index ? "is-today" : ""
                }`}
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
              <BodyBrightFigure
                zoneScores={zoneScores}
                weeklyTarget={bodyBright.weeklyTarget}
              />
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
        </>
      ) : (
        <section className="history-panel">
          <div className="panel-heading">
            <p className="eyebrow">Weekly snapshots</p>
            <h2>History Gallery</h2>
          </div>

          {Object.keys(historyGroups).length === 0 ? (
            <p className="empty-history">
              No completed weeks yet. The first snapshot will appear after week rollover.
            </p>
          ) : (
            Object.entries(historyGroups).map(([monthLabel, snapshots]) => (
              <section className="history-month" key={monthLabel}>
                <h3>{monthLabel}</h3>

                <div className="history-grid">
                  {snapshots.map((snapshot) => (
                    <article
                      className={`history-card ${
                        snapshot.weekType === "inactive" ? "inactive" : "active"
                      }`}
                      key={snapshot.weekStart}
                    >
                      <BodyBrightFigure
                        zoneScores={snapshot.zoneScores}
                        weeklyTarget={bodyBright.weeklyTarget}
                      />
                      <p>{formatWeekLabel(snapshot)}</p>
                      <span>
                        {snapshot.weekType === "inactive"
                          ? "Inactive week"
                          : `${snapshot.totalCreditedScore} credits`}
                      </span>
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}
        </section>
      )}

      <ExerciseDetailModal
        exercise={selectedExercise}
        isOpen={Boolean(selectedExercise)}
        state={selectedExerciseState}
        onSetState={handleSetState}
        onSwap={handleSwapExercise}
        onClose={handleCloseExercise}
      />
    </main>
  );
}

export default App;