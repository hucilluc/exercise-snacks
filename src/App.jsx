import { useEffect, useMemo, useState } from "react";
import Header from "./components/Header";
import BodyBrightFigure from "./components/BodyBrightFigure";
import ExerciseCard from "./components/ExerciseCard";
import ExerciseDetailModal from "./components/ExerciseDetailModal";
import { bodyBright, scoreDays, zoneColors } from "./data/bodyBright";
import { findExerciseInLibrary } from "./data/exerciseLibrary";
import {
  dayNames,
  getMonday,
  getTodayIndex,
  getWeekDates,
  loadProfile,
  parseISODate,
  saveProfile,
} from "./storage";
import "./styles.css";

function formatWeekLabel(snapshot) {
  const start = parseISODate(snapshot.weekStart);
  const end = parseISODate(snapshot.weekEnd);

  const startLabel = start.toLocaleDateString("en-GB", { day: "numeric" });
  const endLabel = end.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

  return `${startLabel}–${endLabel}`;
}

function getMonthLabel(snapshot) {
  return parseISODate(snapshot.weekStart).toLocaleDateString("en-GB", {
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
    if (!groups[label]) groups[label] = [];
    groups[label].push(snapshot);
    return groups;
  }, {});
}

function getSwapOptions(card, dayCards, library) {
  return library.filter(
    (exercise) =>
      exercise.status === "active" &&
      exercise.domain === card.domainPresented &&
      !dayCards.some(
        (other) =>
          other.cardId !== card.cardId && other.exerciseId === exercise.id
      )
  );
}

function App() {
  const currentWeekDates = useMemo(() => getWeekDates(getMonday()), []);
  const todayIndex = getTodayIndex(currentWeekDates);

  const [profile, setProfile] = useState(() => loadProfile(currentWeekDates));
  const [view, setView] = useState("today");
  const [selectedCardId, setSelectedCardId] = useState(null);

  const selectedDate = currentWeekDates.includes(
    profile.currentWeek.selectedDate
  )
    ? profile.currentWeek.selectedDate
    : currentWeekDates[todayIndex];
  const selectedDayIndex = currentWeekDates.indexOf(selectedDate);

  const library = profile.exerciseLibrary;
  const selectedDay = profile.days[selectedDate];
  const dayCards = selectedDay?.cards ?? [];

  const selectedCard = dayCards.find((card) => card.cardId === selectedCardId);
  const selectedExercise = selectedCard
    ? findExerciseInLibrary(library, selectedCard.exerciseId)
    : null;

  const zoneScores = useMemo(
    () => scoreDays(profile.days, currentWeekDates).zoneScores,
    [profile.days, currentWeekDates]
  );

  const historyGroups = useMemo(
    () => groupSnapshotsByMonth(profile.weeklySnapshots),
    [profile.weeklySnapshots]
  );

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  function updateSelectedDayCard(cardId, updateCard) {
    setProfile((current) => {
      const day = current.days[selectedDate];
      if (!day || day.locked) return current;

      return {
        ...current,
        days: {
          ...current.days,
          [selectedDate]: {
            ...day,
            cards: day.cards.map((card) =>
              card.cardId === cardId ? updateCard(card) : card
            ),
          },
        },
      };
    });
  }

  function handleSelectDay(index) {
    setSelectedCardId(null);
    setProfile((current) => ({
      ...current,
      currentWeek: {
        ...current.currentWeek,
        selectedDate: currentWeekDates[index],
      },
    }));
  }

  function handleSetState(cardId, nextState) {
    updateSelectedDayCard(cardId, (card) => ({
      ...card,
      state: card.state === nextState ? "not_started" : nextState,
    }));
  }

  function handleSetNote(cardId, note) {
    updateSelectedDayCard(cardId, (card) => ({ ...card, note }));
  }

  function handleSwap(cardId) {
    const card = dayCards.find((c) => c.cardId === cardId);
    if (!card) return;

    const options = getSwapOptions(card, dayCards, library);
    if (options.length <= 1) return;

    const currentIndex = options.findIndex(
      (exercise) => exercise.id === card.exerciseId
    );
    const replacement = options[(currentIndex + 1) % options.length];

    updateSelectedDayCard(cardId, (current) => ({
      ...current,
      exerciseId: replacement.id,
      exerciseNamePresented: replacement.name,
      bodyBrightZonePresented:
        bodyBright.domainToZone[replacement.domain] ??
        current.bodyBrightZonePresented,
      variantPresented:
        replacement.variantLevels.find(
          (variant) => variant.level === replacement.currentVariantLevel
        ) ?? null,
      dosePresented:
        replacement.doseLevels.find(
          (dose) => dose.level === replacement.currentDoseLevel
        ) ?? null,
      state: "not_started",
      swap: {
        wasSwapped: true,
        swappedAt: new Date().toISOString(),
        fromExerciseId: current.exerciseId,
        toExerciseId: replacement.id,
      },
    }));
  }

  return (
    <main className="app-shell">
      <section className="dashboard-shell">
        <Header />

        <div className="view-toggle" aria-label="App section">
          <button
            className={`day-pill ${view === "today" ? "active" : ""}`}
            type="button"
            onClick={() => {
              setView("today");
              handleSelectDay(todayIndex);
            }}
          >
            Today
          </button>

          <button
            className={`day-pill ${view === "history" ? "active" : ""}`}
            type="button"
            onClick={() => {
              setView("history");
              setSelectedCardId(null);
            }}
          >
            History
          </button>
        </div>

        {view === "today" && (
          <>
            <div className="week-strip" aria-label="Select day">
              {dayNames.map((day, index) => (
                <button
                  className={`day-pill ${
                    selectedDayIndex === index ? "active" : ""
                  } ${todayIndex === index ? "is-today" : ""}`}
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(index)}
                >
                  {day}
                </button>
              ))}
            </div>

            <aside className="body-panel" aria-label="Body Bright weekly progress">
              <BodyBrightFigure
                zoneScores={zoneScores}
                weeklyTarget={bodyBright.weeklyTarget}
              />
            </aside>
          </>
        )}
      </section>

      {view === "today" ? (
        <section className="daily-panel">
          <div className="panel-heading exercise-heading">
            <p className="eyebrow">Exercises</p>
          </div>

          <div className="cards-grid">
            {dayCards.map((card) => {
              const exercise = findExerciseInLibrary(library, card.exerciseId);
              if (!exercise) return null;

              return (
                <ExerciseCard
                  card={card}
                  exercise={exercise}
                  key={card.cardId}
                  zoneColor={zoneColors[card.bodyBrightZonePresented]}
                  onSetState={handleSetState}
                  onOpen={setSelectedCardId}
                />
              );
            })}
          </div>
        </section>
      ) : (
        <section className="history-panel">
          <div className="panel-heading">
            <p className="eyebrow">Weekly snapshots</p>
            <h2>History Gallery</h2>
          </div>

          {Object.keys(historyGroups).length === 0 ? (
            <p className="empty-history">
              No completed weeks yet. The first snapshot will appear after week
              rollover.
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
        card={selectedCard}
        exercise={selectedExercise}
        isOpen={Boolean(selectedCard && selectedExercise)}
        zoneColor={
          selectedCard ? zoneColors[selectedCard.bodyBrightZonePresented] : null
        }
        onSetState={handleSetState}
        onSetNote={handleSetNote}
        onSwap={handleSwap}
        onClose={() => setSelectedCardId(null)}
      />
    </main>
  );
}

export default App;
