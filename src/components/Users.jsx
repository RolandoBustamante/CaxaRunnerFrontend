import { useState, useEffect } from "react";
import { api } from "../api";
import { confirmDialog } from "../utils/dialog";

export default function Users() {
  const [users, setUsers] = useState([]);
  const [races, setRaces] = useState([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  async function fetchUsers() {
    try {
      const [usersData, racesData] = await Promise.all([
        api.getUsers(),
        api.getRaces(),
      ]);
      setUsers(usersData);
      setRaces(racesData);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { fetchUsers(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await api.createUser(username, password);
      setSuccess(`Usuario "${username}" creado correctamente.`);
      setUsername("");
      setPassword("");
      fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id, name) {
    const ok = await confirmDialog({
      title: `¿Eliminar usuario?`,
      text: `El usuario "${name}" será eliminado permanentemente.`,
      confirmText: "Eliminar",
    });
    if (!ok) return;
    try {
      await api.deleteUser(id);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAssignRace(userId, raceId) {
    if (!raceId) return;
    setError(null);
    try {
      await api.assignUserToRace(userId, Number(raceId));
      await fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemoveRace(userId, raceId) {
    setError(null);
    try {
      await api.removeUserFromRace(userId, raceId);
      await fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="users-container">
      <h2 className="section-title">Gestión de Usuarios</h2>

      <div className="users-grid">
        {/* Crear usuario */}
        <div className="card users-create-card">
          <h3 className="card-title">Nuevo Usuario</h3>
          <form className="users-form" onSubmit={handleCreate}>
            <div className="login-field">
              <label className="login-label">Usuario</label>
              <input
                className="login-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="login-field">
              <label className="login-label">Contraseña</label>
              <input
                className="login-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="login-error">{error}</p>}
            {success && <p className="users-success">{success}</p>}
            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? "Creando..." : "Crear usuario"}
            </button>
          </form>
        </div>

        {/* Lista de usuarios */}
        <div className="card">
          <h3 className="card-title">Usuarios registrados</h3>
          <table className="users-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Carreras</th>
                <th>Creado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>
                    <span className={`role-badge role-${u.role.toLowerCase()}`}>
                      {u.role}
                    </span>
                  </td>
                  <td>
                    {u.role === "MASTER" ? (
                      <span className="users-all-races">Acceso total</span>
                    ) : (
                      <div className="user-races-cell">
                        <div className="user-race-list">
                          {u.races?.length ? u.races.map((race) => (
                            <button
                              key={race.id}
                              type="button"
                              className="user-race-chip"
                              onClick={() => handleRemoveRace(u.id, race.id)}
                              title="Quitar asignacion"
                            >
                              {race.name} x
                            </button>
                          )) : (
                            <span className="text-muted">Sin carreras</span>
                          )}
                        </div>
                        <select
                          className="users-race-select"
                          defaultValue=""
                          onChange={(e) => {
                            handleAssignRace(u.id, e.target.value);
                            e.target.value = "";
                          }}
                        >
                          <option value="">Asignar carrera...</option>
                          {races
                            .filter((race) => !(u.races || []).some((assigned) => assigned.id === race.id))
                            .map((race) => (
                              <option key={race.id} value={race.id}>
                                {race.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </td>
                  <td>{new Date(u.createdAt).toLocaleDateString("es-PE")}</td>
                  <td>
                    {u.role !== "MASTER" && (
                      <button
                        className="btn-danger-sm"
                        onClick={() => handleDelete(u.id, u.username)}
                      >
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
