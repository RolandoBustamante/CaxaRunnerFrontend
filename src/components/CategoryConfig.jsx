import { useState } from "react";
import { api } from "../api";
import { DEFAULT_CATEGORIES } from "../utils/categories";

function newRow() {
  return { name: "", minAge: "", maxAge: "" };
}

export default function CategoryConfig({ categories, onCategoriesChange }) {
  const [rows, setRows] = useState(() =>
    categories.map((c) => ({ ...c, maxAge: c.maxAge === null ? "" : c.maxAge }))
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type: "ok"|"error", text }

  function setRow(i, field, value) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
    setMsg(null);
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
    setMsg(null);
  }

  function removeRow(i) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    setMsg(null);
  }

  function moveUp(i) {
    if (i === 0) return;
    setRows((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  }

  function moveDown(i) {
    setRows((prev) => {
      if (i === prev.length - 1) return prev;
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  }

  async function handleSave() {
    // Validate
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.name.trim()) {
        setMsg({ type: "error", text: `Fila ${i + 1}: el nombre no puede estar vacío.` });
        return;
      }
      const min = parseInt(r.minAge, 10);
      if (isNaN(min) || min < 0) {
        setMsg({ type: "error", text: `Fila ${i + 1}: edad mínima inválida.` });
        return;
      }
      if (r.maxAge !== "" && r.maxAge !== null) {
        const max = parseInt(r.maxAge, 10);
        if (isNaN(max) || max < min) {
          setMsg({ type: "error", text: `Fila ${i + 1}: edad máxima debe ser ≥ edad mínima.` });
          return;
        }
      }
    }

    const payload = rows.map((r) => ({
      name: r.name.trim(),
      minAge: parseInt(r.minAge, 10),
      maxAge: r.maxAge === "" || r.maxAge === null ? null : parseInt(r.maxAge, 10),
    }));

    setBusy(true);
    try {
      await api.saveCategories(payload);
      onCategoriesChange(payload);
      setMsg({ type: "ok", text: "Categorías guardadas correctamente." });
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Error al guardar." });
    } finally {
      setBusy(false);
    }
  }

  function handleReset() {
    setRows(DEFAULT_CATEGORIES.map((c) => ({ ...c, maxAge: c.maxAge === null ? "" : c.maxAge })));
    setMsg(null);
  }

  return (
    <div className="config-container">
      <div className="section-header">
        <h2>Configuración de Categorías</h2>
      </div>

      <p className="config-desc">
        Define los rangos de edad y nombres de las categorías. El orden aquí es el orden de visualización en resultados.
        Deja la <strong>edad máxima</strong> vacía para que la categoría no tenga límite superior.
      </p>

      <div className="config-table-wrapper">
        <table className="data-table config-cat-table">
          <thead>
            <tr>
              <th style={{ width: "2rem" }}></th>
              <th>Nombre de categoría</th>
              <th>Edad mínima</th>
              <th>Edad máxima</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="reorder-cell">
                  <button className="reorder-btn" onClick={() => moveUp(i)} disabled={i === 0} title="Subir">▲</button>
                  <button className="reorder-btn" onClick={() => moveDown(i)} disabled={i === rows.length - 1} title="Bajar">▼</button>
                </td>
                <td>
                  <input
                    className="config-input"
                    type="text"
                    placeholder="ej: Master A"
                    value={row.name}
                    onChange={(e) => setRow(i, "name", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="config-input config-input-age"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={row.minAge}
                    onChange={(e) => setRow(i, "minAge", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="config-input config-input-age"
                    type="number"
                    min="0"
                    placeholder="sin límite"
                    value={row.maxAge}
                    onChange={(e) => setRow(i, "maxAge", e.target.value)}
                  />
                </td>
                <td>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => removeRow(i)}
                    title="Eliminar fila"
                  >
                    ✕
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
          {rows.map((r, i) => (
            <span key={i} className="category-tag">
              {r.name || "—"} ({r.minAge}–{r.maxAge === "" || r.maxAge === null ? "∞" : r.maxAge} años)
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
