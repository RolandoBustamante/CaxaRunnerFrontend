import { useEffect, useState } from "react";
import { api } from "../api";
import { confirmDialog } from "../utils/dialog";
import { DEFAULT_CATEGORIES } from "../utils/categories";

function newRow() {
  return { name: "", minAge: "", maxAge: "" };
}

export default function CategoryConfig({
  categories,
  onCategoriesChange,
  raceId,
  race,
  onRaceUpdated,
}) {
  const [rows, setRows] = useState(() =>
    categories.map((category) => ({
      ...category,
      maxAge: category.maxAge === null ? "" : category.maxAge,
    }))
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    setRows(categories.map((category) => ({
      ...category,
      maxAge: category.maxAge === null ? "" : category.maxAge,
    })));
    setMsg(null);
  }, [categories]);

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
        setMsg({ type: "error", text: `Fila ${i + 1}: el nombre no puede estar vacio.` });
        return;
      }

      const min = parseInt(row.minAge, 10);
      if (Number.isNaN(min) || min < 0) {
        setMsg({ type: "error", text: `Fila ${i + 1}: edad minima invalida.` });
        return;
      }

      if (row.maxAge !== "" && row.maxAge !== null) {
        const max = parseInt(row.maxAge, 10);
        if (Number.isNaN(max) || max < min) {
          setMsg({ type: "error", text: `Fila ${i + 1}: edad maxima debe ser mayor o igual a la minima.` });
          return;
        }
      }
    }

    const payload = rows.map((row) => ({
      name: row.name.trim(),
      minAge: parseInt(row.minAge, 10),
      maxAge: row.maxAge === "" || row.maxAge === null ? null : parseInt(row.maxAge, 10),
    }));

    setBusy(true);
    try {
      await api.saveCategories(payload, raceId);
      onCategoriesChange(payload);
      setMsg({ type: "ok", text: "Categorias guardadas correctamente." });
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Error al guardar." });
    } finally {
      setBusy(false);
    }
  }

  function handleReset() {
    setRows(DEFAULT_CATEGORIES.map((category) => ({
      ...category,
      maxAge: category.maxAge === null ? "" : category.maxAge,
    })));
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

  return (
    <div className="config-container">
      <div className="section-header">
        <h2>Configuracion de categorias</h2>
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
          {!race.isOfficial && (
            <button className="btn btn-warning" onClick={handleMarkOfficial} disabled={busy}>
              Marcar como oficial
            </button>
          )}
        </div>
      )}

      <p className="config-desc">
        Define rangos de edad y nombres de categoria para la carrera activa.
      </p>

      <div className="config-table-wrapper">
        <table className="data-table config-cat-table">
          <thead>
            <tr>
              <th style={{ width: "2rem" }}></th>
              <th>Categoria</th>
              <th>Edad minima</th>
              <th>Edad maxima</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td className="reorder-cell">
                  <button
                    className="reorder-btn"
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    title="Subir"
                  >
                    ^
                  </button>
                  <button
                    className="reorder-btn"
                    onClick={() => moveDown(index)}
                    disabled={index === rows.length - 1}
                    title="Bajar"
                  >
                    v
                  </button>
                </td>
                <td>
                  <input
                    className="config-input"
                    type="text"
                    placeholder="Ej: Master A"
                    value={row.name}
                    onChange={(e) => setRow(index, "name", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="config-input config-input-age"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={row.minAge}
                    onChange={(e) => setRow(index, "minAge", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="config-input config-input-age"
                    type="number"
                    min="0"
                    placeholder="Sin limite"
                    value={row.maxAge}
                    onChange={(e) => setRow(index, "maxAge", e.target.value)}
                  />
                </td>
                <td>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => removeRow(index)}
                    title="Eliminar fila"
                  >
                    X
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="config-actions">
        <button className="btn btn-secondary" onClick={addRow}>+ Agregar categoria</button>
        <button className="btn btn-secondary" onClick={handleReset}>Restaurar por defecto</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={busy}>
          {busy ? "Guardando..." : "Guardar categorias"}
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
              {row.name || "-"} ({row.minAge}-{row.maxAge === "" || row.maxAge === null ? "inf" : row.maxAge})
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
