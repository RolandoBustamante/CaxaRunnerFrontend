import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { confirmDialog } from "../utils/dialog";
import { DEFAULT_CATEGORIES } from "../utils/categories";
import { toDateInputValue } from "../utils/dates";

function normalizeRows(categories) {
  return categories.map((category) => ({
    ...category,
    distance: category.distance ?? "",
    gender: category.gender ?? "",
    maxAge: category.maxAge === null ? "" : category.maxAge,
  }));
}

function newRow() {
  return { name: "", minAge: "", maxAge: "", distance: "", gender: "" };
}

export default function CategoryConfig({
  categories,
  onCategoriesChange,
  raceId,
  race,
  onRaceUpdated,
}) {
  const [rows, setRows] = useState(() => normalizeRows(categories));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [eventDate, setEventDate] = useState(toDateInputValue(race?.eventDate));
  const [publicNotice, setPublicNotice] = useState(race?.publicNotice || "");

  const distanceOptions = useMemo(() => {
    const raceDistances = Array.isArray(race?.distances) ? race.distances : [];
    const rowDistances = rows.map((row) => String(row.distance || "").trim().toUpperCase()).filter(Boolean);
    return [...new Set([...raceDistances, ...rowDistances])].sort();
  }, [race?.distances, rows]);

  useEffect(() => {
    setRows(normalizeRows(categories));
    setEventDate(toDateInputValue(race?.eventDate));
    setPublicNotice(race?.publicNotice || "");
    setMsg(null);
  }, [categories, race?.eventDate, race?.publicNotice]);

  function setRow(index, field, value) {
    setRows((prev) => prev.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [field]: value } : row
    )));
    setMsg(null);
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
    setMsg(null);
  }

  function removeRow(index) {
    setRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
    setMsg(null);
  }

  function moveUp(index) {
    if (index === 0) return;
    setRows((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function moveDown(index) {
    setRows((prev) => {
      if (index === prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  async function handleSave() {
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row.name.trim()) {
        setMsg({ type: "error", text: `Fila ${i + 1}: el nombre no puede estar vacío.` });
        return;
      }

      const min = parseInt(row.minAge, 10);
      if (Number.isNaN(min) || min < 0) {
        setMsg({ type: "error", text: `Fila ${i + 1}: edad mínima inválida.` });
        return;
      }

      if (row.maxAge !== "" && row.maxAge !== null) {
        const max = parseInt(row.maxAge, 10);
        if (Number.isNaN(max) || max < min) {
          setMsg({ type: "error", text: `Fila ${i + 1}: edad máxima debe ser mayor o igual a la mínima.` });
          return;
        }
      }

      if (row.gender && !["M", "F"].includes(String(row.gender).trim().toUpperCase())) {
        setMsg({ type: "error", text: `Fila ${i + 1}: sexo inválido.` });
        return;
      }
    }

    const payload = rows.map((row) => ({
      name: row.name.trim(),
      minAge: parseInt(row.minAge, 10),
      maxAge: row.maxAge === "" || row.maxAge === null ? null : parseInt(row.maxAge, 10),
      distance: row.distance ? String(row.distance).trim().toUpperCase() : null,
      gender: row.gender ? String(row.gender).trim().toUpperCase() : null,
    }));

    setBusy(true);
    try {
      await api.saveCategories(payload, raceId);
      onCategoriesChange(payload);
      setMsg({ type: "ok", text: "Categorías guardadas correctamente." });
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Error al guardar." });
    } finally {
      setBusy(false);
    }
  }

  function handleReset() {
    setRows(normalizeRows(DEFAULT_CATEGORIES));
    setMsg(null);
  }

  async function handleMarkOfficial() {
    if (!raceId || race?.isOfficial) return;

    const ok = await confirmDialog({
      title: "Marcar carrera como oficial",
      text: "La carrera pasara de pruebas a oficial.",
      confirmText: "Marcar oficial",
    });
    if (!ok) return;

    setBusy(true);
    try {
      await api.markRaceOfficial(raceId);
      setMsg({ type: "ok", text: "La carrera quedo marcada como oficial." });
      await onRaceUpdated?.();
    } catch (err) {
      setMsg({ type: "error", text: err.message || "No se pudo marcar la carrera." });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveRaceInfo() {
    if (!raceId) return;

    setBusy(true);
    try {
      await api.updateRace(raceId, {
        eventDate: eventDate || null,
        publicNotice: publicNotice.trim() || null,
      });
      setMsg({ type: "ok", text: "Datos de la carrera guardados." });
      await onRaceUpdated?.();
    } catch (err) {
      setMsg({ type: "error", text: err.message || "No se pudo guardar la información de la carrera." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="config-container">
      <div className="section-header">
        <h2>Configuración de categorías</h2>
      </div>

      {race && (
        <div className="config-race-banner">
          <div className="config-race-info">
            <strong>{race.name}</strong>
            <span
              className={`config-race-state ${
                race.isOfficial ? "config-race-state-official" : "config-race-state-testing"
              }`}
            >
              {race.isOfficial ? "Oficial" : "Pruebas"}
            </span>
          </div>
          <div className="config-race-actions">
            <label className="config-date-field">
              <span>Fecha de carrera</span>
              <input
                className="config-input"
                type="date"
                value={eventDate}
                onChange={(event) => {
                  setEventDate(event.target.value);
                  setMsg(null);
                }}
              />
            </label>
            <label className="config-notice-field">
              <span>Comunicado público</span>
              <textarea
                className="config-input config-notice-textarea"
                rows="4"
                value={publicNotice}
                onChange={(event) => {
                  setPublicNotice(event.target.value);
                  setMsg(null);
                }}
                placeholder="Ej: Conforme a las bases de la competencia, las categorías que no alcanzaron el mínimo requerido de participantes fueron fusionadas con las categorías correspondientes."
              />
            </label>
            <button className="btn btn-secondary" onClick={handleSaveRaceInfo} disabled={busy}>
              Guardar datos
            </button>
            {!race.isOfficial && (
              <button className="btn btn-warning" onClick={handleMarkOfficial} disabled={busy}>
                Marcar como oficial
              </button>
            )}
          </div>
        </div>
      )}

      <p className="config-desc">
        Define categorías por distancia, sexo y rango de edad para la carrera activa. Si dejas distancia o sexo vacíos, la regla aplica a todos.
      </p>

      <div className="config-table-wrapper">
        <table className="data-table config-cat-table">
          <thead>
            <tr>
              <th style={{ width: "2rem" }}></th>
              <th>Categoría</th>
              <th>Distancia</th>
              <th>Sexo</th>
              <th>Edad mínima</th>
              <th>Edad máxima</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td className="reorder-cell">
                  <button className="reorder-btn" onClick={() => moveUp(index)} disabled={index === 0} title="Subir">^</button>
                  <button className="reorder-btn" onClick={() => moveDown(index)} disabled={index === rows.length - 1} title="Bajar">v</button>
                </td>
                <td>
                  <input
                    className="config-input"
                    type="text"
                    placeholder="Ej: Libre"
                    value={row.name}
                    onChange={(event) => setRow(index, "name", event.target.value)}
                  />
                </td>
                <td>
                  <select
                    className="config-input"
                    value={row.distance}
                    onChange={(event) => setRow(index, "distance", event.target.value)}
                  >
                    <option value="">Todas</option>
                    {distanceOptions.map((distance) => (
                      <option key={distance} value={distance}>{distance}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="config-input"
                    value={row.gender}
                    onChange={(event) => setRow(index, "gender", event.target.value)}
                  >
                    <option value="">Todos</option>
                    <option value="M">M</option>
                    <option value="F">F</option>
                  </select>
                </td>
                <td>
                  <input
                    className="config-input config-input-age"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={row.minAge}
                    onChange={(event) => setRow(index, "minAge", event.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="config-input config-input-age"
                    type="number"
                    min="0"
                    placeholder="Sin limite"
                    value={row.maxAge}
                    onChange={(event) => setRow(index, "maxAge", event.target.value)}
                  />
                </td>
                <td>
                  <button className="btn btn-danger btn-sm" onClick={() => removeRow(index)} title="Eliminar fila">
                    X
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="config-actions">
        <button className="btn btn-secondary" onClick={addRow}>+ Agregar categoría</button>
        <button className="btn btn-secondary" onClick={handleReset}>Restaurar por defecto</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={busy}>
          {busy ? "Guardando..." : "Guardar categorías"}
        </button>
      </div>

      {msg && (
        <div className={`config-msg ${msg.type === "ok" ? "config-msg-ok" : "config-msg-error"}`}>
          {msg.text}
        </div>
      )}

      <div className="config-preview">
        <h3>Vista previa</h3>
        <div className="config-preview-chips">
          {rows.map((row, index) => (
            <span key={index} className="category-tag">
              {(row.distance || "Todas")} · {(row.gender || "Todos")} · {row.name || "-"} ({row.minAge}-{row.maxAge === "" || row.maxAge === null ? "inf" : row.maxAge})
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
