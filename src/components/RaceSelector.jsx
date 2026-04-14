export default function RaceSelector({
  races,
  selectedRaceId,
  onSelectRace,
  currentUser,
  onCreateRace,
  creatingRace,
}) {
  const hasRaces = races.length > 0;

  return (
    <div className="race-selector-card">
      <div className="race-selector-header">
        <div>
          <p className="race-selector-kicker">Carrera activa</p>
          <h3>Seleccion de carrera</h3>
        </div>
        {currentUser?.role === "MASTER" && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCreateRace}
            disabled={creatingRace}
          >
            {creatingRace ? "Creando..." : "+ Nueva carrera"}
          </button>
        )}
      </div>

      {hasRaces ? (
        <div className="race-selector-grid">
          {races.map((race) => {
            const selected = String(selectedRaceId) === String(race.id);
            return (
              <button
                key={race.id}
                type="button"
                className={`race-option ${selected ? "race-option-active" : ""}`}
                onClick={() => onSelectRace(race.id)}
              >
                <span className="race-option-name">{race.name}</span>
                <span className="race-option-meta">
                  {race.isOfficial ? "Oficial" : "Pruebas"}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="race-selector-empty">
          No tienes carreras asignadas. Un administrador debe asignarte al menos una.
        </div>
      )}
    </div>
  );
}
