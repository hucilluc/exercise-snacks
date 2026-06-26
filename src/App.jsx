import { useEffect, useMemo, useRef, useState } from "react";
import Header, { DEFAULT_CAPTION } from "./components/Header";
import BodyBrightFigure from "./components/BodyBrightFigure";
import ExerciseCard from "./components/ExerciseCard";
import ExerciseDetailModal from "./components/ExerciseDetailModal";
import { bodyBright, scoreDays, zoneColors } from "./data/bodyBright";
import { findExerciseInLibrary } from "./data/exerciseLibrary";
import {
  markNotSuitable,
  moveCards,
  nextInSwapCycle,
  recentSkipCounts,
  recentUseCounts,
  restoreSuitability,
} from "./recommendationEngine";
import {
  applyImportedProfile,
  dayNames,
  exportFilename,
  exportProfileJSON,
  getMonday,
  getTodayIndex,
  getWeekDates,
  loadProfile,
  parseISODate,
  saveProfile,
  toISODate,
} from "./storage";
import { validateProfile } from "./profileValidation";
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

function App() {
  const currentWeekDates = useMemo(() => getWeekDates(getMonday()), []);
  const todayIndex = getTodayIndex(currentWeekDates);

  const [profile, setProfile] = useState(() => loadProfile(currentWeekDates));
  const [view, setView] = useState("today");
  const [selectedCardId, setSelectedCardId] = useState(null);

  const fileInputRef = useRef(null);
  const [pendingImport, setPendingImport] = useState(null);
  const [allowProtected, setAllowProtected] = useState(false);
  const [importStatus, setImportStatus] = useState(null);

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

  // Caption shown under the header. Read from the (importable) profile
  // settings, preferring the home-screen caption, then the generic and
  // weekly variants; falls back to the built-in default when none is set.
  const settings = profile.settings ?? {};
  const headerCaption =
    settings.homeCaption ||
    settings.caption ||
    settings.weeklyCaption ||
    DEFAULT_CAPTION;

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
    setProfile((current) => {
      const day = current.days[selectedDate];
      if (!day || day.locked) return current;

      const card = day.cards.find((c) => c.cardId === cardId);
      if (!card) return current;

      const resolvedState = card.state === nextState ? "not_started" : nextState;

      // Entering not_suitable soft-disables the exercise and sweeps its
      // untouched copies off today/future days (spec §7).
      if (resolvedState === "not_suitable") {
        const result = markNotSuitable(
          current.days,
          current.exerciseLibrary,
          selectedDate,
          cardId,
          current.settings,
          toISODate(new Date())
        );
        return {
          ...current,
          days: result.days,
          exerciseLibrary: result.library,
        };
      }

      // Leaving not_suitable restores the exercise to active rotation.
      const exerciseLibrary =
        card.state === "not_suitable"
          ? restoreSuitability(current.exerciseLibrary, card.exerciseId)
          : current.exerciseLibrary;

      return {
        ...current,
        exerciseLibrary,
        days: {
          ...current.days,
          [selectedDate]: {
            ...day,
            cards: day.cards.map((c) =>
              c.cardId === cardId ? { ...c, state: resolvedState } : c
            ),
          },
        },
      };
    });
  }

  function handleSetNote(cardId, note) {
    updateSelectedDayCard(cardId, (card) => ({ ...card, note }));
  }

  function handleMoveCard(cardId, toDate) {
    setSelectedCardId(null);
    setProfile((current) => ({
      ...current,
      days: moveCards(
        current.days,
        selectedDate,
        cardId,
        toDate,
        current.exerciseLibrary,
        current.settings
      ),
    }));
  }

  function handleExport() {
    const blob = new Blob([exportProfileJSON(profile)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFilename();
    link.click();
    URL.revokeObjectURL(url);
    setImportStatus({ kind: "ok", text: "Profile exported." });
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportStatus(null);
    setAllowProtected(false);

    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setPendingImport(null);
      setImportStatus({ kind: "error", text: "That file is not valid JSON." });
      return;
    }

    setPendingImport({
      fileName: file.name,
      parsed,
      result: validateProfile(parsed, profile),
    });
  }

  function handleConfirmImport() {
    if (!pendingImport) return;
    const { result, parsed } = pendingImport;
    if (result.errors.length > 0) return;
    if (result.protectedChanges.length > 0 && !allowProtected) return;

    const imported = applyImportedProfile(parsed, currentWeekDates);
    setProfile(imported);
    setPendingImport(null);
    setAllowProtected(false);
    setSelectedCardId(null);
    setImportStatus({
      kind: "ok",
      text: "Profile imported. A backup of your previous data was kept.",
    });
  }

  function handleCancelImport() {
    setPendingImport(null);
    setAllowProtected(false);
  }

  function handleSwap(cardId) {
    const card = dayCards.find((c) => c.cardId === cardId);
    if (!card) return;

    const recentUse = recentUseCounts(profile.days, selectedDate);
    const recentSkips = recentSkipCounts(profile.days, selectedDate);
    const replacement = nextInSwapCycle(card, library, recentUse, recentSkips);
    if (!replacement) return;

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
        <Header caption={headerCaption} />

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

          <button
            className={`day-pill ${view === "data" ? "active" : ""}`}
            type="button"
            onClick={() => {
              setView("data");
              setSelectedCardId(null);
            }}
          >
            Data
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

      {view === "data" && (
        <section className="daily-panel data-panel">
          <div className="panel-heading">
            <p className="eyebrow">Your profile</p>
            <h2>Export &amp; Import</h2>
          </div>

          <p className="data-intro">
            Your complete profile — exercise library, daily history, notes and
            weekly snapshots — lives in this browser as a single file you can
            export at any time. Use it as a backup, to move to another device,
            or to review your progress with an LLM: the file carries its own
            review instructions, and after discussing changes you can import a
            deliberately revised copy here.
          </p>

          <div className="data-actions">
            <button className="secondary-button" type="button" onClick={handleExport}>
              Export profile
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              Import profile…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={handleImportFile}
            />
          </div>

          {importStatus && (
            <p className={`import-status ${importStatus.kind}`}>
              {importStatus.text}
            </p>
          )}

          {pendingImport && (
            <div className="import-preview">
              <h3>Import {pendingImport.fileName}</h3>

              {pendingImport.result.errors.length > 0 ? (
                <>
                  <p className="import-status error">
                    This file can't be imported:
                  </p>
                  <ul className="import-list error">
                    {pendingImport.result.errors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  {pendingImport.result.summary && (
                    <p className="import-summary">
                      {pendingImport.result.summary.profileName} — last updated{" "}
                      {pendingImport.result.summary.lastUpdated}.{" "}
                      {pendingImport.result.summary.dayCount} days,{" "}
                      {pendingImport.result.summary.snapshotCount} weekly
                      snapshots, {pendingImport.result.summary.libraryCount}{" "}
                      library exercises.
                    </p>
                  )}

                  {pendingImport.result.warnings.length > 0 && (
                    <ul className="import-list warning">
                      {pendingImport.result.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}

                  {pendingImport.result.protectedChanges.length > 0 && (
                    <div className="protected-notice">
                      <p>
                        ⚠ This file changes protected sections:{" "}
                        <strong>
                          {pendingImport.result.protectedChanges.join(", ")}
                        </strong>
                        . The review guidance and LLM permissions normally may
                        not be altered by an imported file.
                      </p>
                      <label className="protected-allow">
                        <input
                          type="checkbox"
                          checked={allowProtected}
                          onChange={(e) => setAllowProtected(e.target.checked)}
                        />
                        I made this change deliberately — allow it
                      </label>
                    </div>
                  )}
                </>
              )}

              <div className="import-actions">
                <button
                  className="state-button"
                  type="button"
                  disabled={
                    pendingImport.result.errors.length > 0 ||
                    (pendingImport.result.protectedChanges.length > 0 &&
                      !allowProtected)
                  }
                  onClick={handleConfirmImport}
                >
                  Import
                </button>
                <button
                  className="state-button"
                  type="button"
                  onClick={handleCancelImport}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {view === "today" && (
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
      )}

      {view === "history" && (
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
        weekDates={currentWeekDates}
        dayNames={dayNames}
        selectedDate={selectedDate}
        onSetState={handleSetState}
        onSetNote={handleSetNote}
        onSwap={handleSwap}
        onMove={handleMoveCard}
        onClose={() => setSelectedCardId(null)}
      />
    </main>
  );
}

export default App;
