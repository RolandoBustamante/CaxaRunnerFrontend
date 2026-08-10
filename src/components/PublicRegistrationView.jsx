import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { formatRaceDate } from "../utils/dates";
import { DEFAULT_CATEGORIES, getCategoryName } from "../utils/categories";

const EMPTY_PARTICIPANT = {
  documento: "",
  nombre: "",
  birthDate: "",
  genero: "M",
  distancia: "",
  procedencia: "",
  bloodType: "",
  garmentType: "POLO",
  garmentSize: "",
  club: "",
  emergencyName: "",
  emergencyPhone: "",
};

const BLOOD_TYPES = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
const GARMENT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

function getSlugFromPath() {
  const match = window.location.pathname.match(/^\/inscripciones\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function normalizeParticipant(participant) {
  return {
    ...participant,
    documento: participant.documento.trim().toUpperCase(),
    nombre: participant.nombre.trim(),
    birthDate: participant.birthDate,
    genero: participant.genero,
    distancia: participant.distancia.trim().toUpperCase(),
    procedencia: participant.procedencia.trim(),
    bloodType: participant.bloodType.trim().toUpperCase(),
    garmentType: participant.garmentType,
    garmentSize: participant.garmentSize.trim().toUpperCase(),
    club: participant.club.trim(),
    emergencyName: participant.emergencyName.trim(),
    emergencyPhone: participant.emergencyPhone.trim(),
  };
}

function calculateAgeAtDate(birthDateValue, referenceValue) {
  if (!birthDateValue) return null;
  const birthDate = new Date(`${birthDateValue}T00:00:00.000Z`);
  const referenceDate = referenceValue ? new Date(referenceValue) : new Date();
  if (Number.isNaN(birthDate.getTime()) || Number.isNaN(referenceDate.getTime())) return null;

  let age = referenceDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = referenceDate.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export default function PublicRegistrationView() {
  const slug = getSlugFromPath();
  const [race, setRace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const [busy, setBusy] = useState(false);
  const [registrationType, setRegistrationType] = useState("INDIVIDUAL");
  const [contact, setContact] = useState({ name: "", phone: "", email: "" });
  const [participants, setParticipants] = useState([{ ...EMPTY_PARTICIPANT }]);
  const [activeParticipantIndex, setActiveParticipantIndex] = useState(0);
  const [paymentMode, setPaymentMode] = useState("ONE_VOUCHER");
  const [vouchers, setVouchers] = useState([]);
  const [participantPhotos, setParticipantPhotos] = useState({});
  const [discountCodeInput, setDiscountCodeInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [discountMessage, setDiscountMessage] = useState("");
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [showRulesDialog, setShowRulesDialog] = useState(false);
  const [showPhotoReminder, setShowPhotoReminder] = useState(false);
  const [photoReminderAccepted, setPhotoReminderAccepted] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    api.getRegistrationForm(slug)
      .then(({ race: raceData }) => {
        const distances = Array.isArray(raceData.distances) && raceData.distances.length > 0
          ? raceData.distances
          : ["5K", "10K"];
        document.title = `Inscripción - ${raceData.name}`;
        setRace({ ...raceData, distances });
        setParticipants([{ ...EMPTY_PARTICIPANT, distancia: distances[0] || "" }]);
        if (raceData.discountsEnabled !== true) {
          setDiscountCodeInput("");
          setAppliedDiscount(null);
          setDiscountMessage("");
        }
        setRulesAccepted(false);
      })
      .catch((err) => setError(err.message || "No se pudo cargar el formulario."))
      .finally(() => setLoading(false));
  }, [slug]);

  const priceMap = useMemo(() => {
    const rows = Array.isArray(race?.registrationPrices) ? race.registrationPrices : [];
    return new Map(rows.map((row) => [String(row.distance).toUpperCase(), Number(row.price)]));
  }, [race]);

  const total = useMemo(() => participants.reduce((sum, participant) => {
    const price = priceMap.get(String(participant.distancia).toUpperCase());
    return Number.isFinite(price) ? sum + price : sum;
  }, 0), [participants, priceMap]);

  const discountsEnabled = race?.discountsEnabled === true;
  const discountAmount = discountsEnabled ? appliedDiscount?.discountAmount ?? 0 : 0;
  const finalTotal = Math.max(0, total - discountAmount);

  const categories = useMemo(() => (
    Array.isArray(race?.categories) && race.categories.length > 0 ? race.categories : DEFAULT_CATEGORIES
  ), [race]);

  const categoryOptions = useMemo(() => (
    [...new Set(categories.map((category) => String(category?.name || "").trim()).filter(Boolean))]
  ), [categories]);

  const bankAccounts = useMemo(() => (
    Array.isArray(race?.registrationPaymentMethods?.bankAccounts)
      ? race.registrationPaymentMethods.bankAccounts
      : []
  ), [race]);

  const digitalWallets = useMemo(() => (
    Array.isArray(race?.registrationPaymentMethods?.digitalWallets)
      ? race.registrationPaymentMethods.digitalWallets
      : []
  ), [race]);

  const raceLogoSrc = race?.raceLogoPath ? api.getAssetUrl(race.raceLogoPath) : "/crlogo-horizontal.svg";
  const rulesPdfSrc = race?.registrationRulesPdfPath ? api.getAssetUrl(race.registrationRulesPdfPath) : "";

  function getParticipantAge(participant) {
    return calculateAgeAtDate(participant.birthDate, race?.eventDate);
  }

  function getParticipantCategory(participant) {
    const age = getParticipantAge(participant);
    if (!Number.isFinite(age)) return "";
    const categoryName = getCategoryName(age, participant.genero, participant.distancia, categories);
    return categoryName === "-" ? "" : categoryName;
  }

  function setParticipant(index, field, value) {
    setParticipants((prev) => prev.map((participant, rowIndex) => (
      rowIndex === index ? { ...participant, [field]: value } : participant
    )));
    setPhotoReminderAccepted(false);
    setAppliedDiscount(null);
    setDiscountMessage("");
    setError("");
  }

  function handleRegistrationTypeChange(type) {
    setRegistrationType(type);
    setError("");
    setVouchers([]);
    if (type === "INDIVIDUAL") {
      setPaymentMode("ONE_VOUCHER");
      setParticipants((prev) => [prev[0] || { ...EMPTY_PARTICIPANT, distancia: race?.distances?.[0] || "" }]);
      setParticipantPhotos((prev) => ({ 0: prev[0] || null }));
      setActiveParticipantIndex(0);
    }
  }

  function addParticipant() {
    if (registrationType === "INDIVIDUAL") return;
    setAppliedDiscount(null);
    setDiscountMessage("");
    setPhotoReminderAccepted(false);
    setParticipants((prev) => [
      ...prev,
      { ...EMPTY_PARTICIPANT, distancia: race?.distances?.[0] || "" },
    ]);
    setActiveParticipantIndex(participants.length);
  }

  function removeParticipant(index) {
    if (registrationType === "INDIVIDUAL") return;
    setAppliedDiscount(null);
    setDiscountMessage("");
    setPhotoReminderAccepted(false);
    setParticipants((prev) => {
      if (prev.length === 1) return prev;
      const next = prev.filter((_, rowIndex) => rowIndex !== index);
      setActiveParticipantIndex((current) => Math.max(0, Math.min(current >= index ? current - 1 : current, next.length - 1)));
      return next;
    });
    setParticipantPhotos((prev) => {
      const next = {};
      Object.entries(prev).forEach(([key, file]) => {
        const currentIndex = Number(key);
        if (currentIndex < index) next[currentIndex] = file;
        if (currentIndex > index) next[currentIndex - 1] = file;
      });
      return next;
    });
  }

  function setParticipantPhoto(index, file) {
    setParticipantPhotos((prev) => ({ ...prev, [index]: file || null }));
    setPhotoReminderAccepted(false);
    setError("");
  }

  function openDatePicker(event) {
    if (typeof event.currentTarget.showPicker === "function") {
      event.currentTarget.showPicker();
    }
  }

  async function applyDiscountCode() {
    if (!discountsEnabled) return;
    const code = discountCodeInput.trim().toUpperCase();
    if (!code) {
      setAppliedDiscount(null);
      setDiscountMessage("Ingresa un codigo de descuento.");
      return;
    }

    setDiscountMessage("");
    try {
      const data = await api.validateDiscountCode(slug, code, total);
      setAppliedDiscount({
        code: data.discountCode.code,
        percent: data.discountCode.percent,
        discountAmount: data.discountAmount || 0,
      });
      setDiscountCodeInput(data.discountCode.code);
      setDiscountMessage(`Descuento aplicado: ${Number(data.discountCode.percent).toFixed(2)}%`);
    } catch (err) {
      setAppliedDiscount(null);
      setDiscountMessage(err.message || "Codigo no valido.");
    }
  }

  function validate() {
    if (!contact.name.trim()) return "Ingresa el nombre de contacto.";
    if (!contact.phone.trim() && !contact.email.trim()) return "Ingresa teléfono o correo de contacto.";
    if (race?.registrationRulesPdfPath && !rulesAccepted) return "Debes leer y aceptar las bases de la carrera.";
    if (vouchers.length === 0) return "Sube al menos un voucher.";
    if (registrationType === "INDIVIDUAL" && participants.length !== 1) return "La inscripción individual solo permite un participante.";
    if (registrationType === "INDIVIDUAL" && vouchers.length !== 1) return "Para inscripción individual sube un solo voucher.";
    if (registrationType === "GROUP" && paymentMode === "MULTIPLE_VOUCHERS" && vouchers.length < participants.length) {
      return "Para vouchers separados, sube un voucher por participante.";
    }

    const seenDocs = new Set();
    for (let index = 0; index < participants.length; index += 1) {
      const participant = normalizeParticipant(participants[index]);
      const label = `Participante ${index + 1}`;
      if (!participant.documento) return `${label}: documento de identidad requerido.`;
      if (seenDocs.has(participant.documento)) return `${label}: documento de identidad repetido.`;
      seenDocs.add(participant.documento);
      if (!participant.nombre) return `${label}: nombre requerido.`;
      if (!participant.birthDate) return `${label}: fecha de nacimiento requerida.`;
      if (!participant.distancia) return `${label}: distancia requerida.`;
      if (!participant.procedencia) return `${label}: lugar de procedencia requerido.`;
      if (!participant.bloodType) return `${label}: tipo de sangre requerido.`;
      if (!participant.garmentType) return `${label}: selecciona bividi o polo.`;
      if (!participant.garmentSize) return `${label}: talla requerida.`;
    }
    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }

    const missingPhotoCount = participants.filter((_, index) => !participantPhotos[index]).length;
    if (missingPhotoCount > 0 && !photoReminderAccepted) {
      setShowPhotoReminder(true);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const result = await api.submitRegistration(slug, {
        contact,
        participants: participants.map(normalizeParticipant),
        paymentMode: registrationType === "INDIVIDUAL" ? "ONE_VOUCHER" : paymentMode,
        discountCode: discountsEnabled ? discountCodeInput.trim() : "",
        rulesAccepted,
        notes,
      }, vouchers, participantPhotos);
      setSuccess(result.registration);
    } catch (err) {
      setError(err.message || "No se pudo enviar la inscripción.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="registration-public-page"><div className="registration-loading">Cargando inscripción...</div></div>;
  }

  if (error && !race) {
    return <div className="registration-public-page"><div className="registration-error-card">{error}</div></div>;
  }

  if (success) {
    return (
      <div className="registration-public-page">
        <section className="registration-success">
          <img src={raceLogoSrc} alt={race?.name || "Cajamarca Runners"} />
          <span>Inscripción recibida</span>
          <h1>{success.code}</h1>
          <p>Guardamos tu solicitud con {success.participants.length} participante(s). El equipo validará el voucher antes de confirmar la inscripción.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="registration-public-page">
      <section className="registration-hero">
        <img className="registration-hero-logo" src={raceLogoSrc} alt={race.name} />
        <div>
          <span className="registration-kicker">Inscripción oficial</span>
          <h1>{race.name}</h1>
          {race.eventDate && <p>{formatRaceDate(race.eventDate)}</p>}
        </div>
      </section>

      {!race.registrationsEnabled && (
        <div className="registration-error-card">Las inscripciones todavía no están habilitadas para esta carrera.</div>
      )}

      <form className="registration-form" onSubmit={handleSubmit}>
        <section className="registration-panel registration-payment-panel">
          <div>
            <span className="registration-panel-label">Resumen</span>
            <h2>{participants.length} participante(s)</h2>
            <p>{total > 0 ? `Total referencial: S/ ${finalTotal.toFixed(2)}` : "Revisa las indicaciones de pago del organizador."}</p>
          </div>
          {discountsEnabled && appliedDiscount && (
            <div className="registration-discount-summary">
              <span>Subtotal: S/ {total.toFixed(2)}</span>
              <span>Descuento {appliedDiscount.code}: -S/ {discountAmount.toFixed(2)}</span>
              <strong>Total: S/ {finalTotal.toFixed(2)}</strong>
            </div>
          )}
          <div className="registration-price-list">
            {(race.registrationPrices || []).map((item) => (
              <span key={item.distance}>
                {item.label && <em>{item.label}</em>}
                <strong>{item.distance}</strong>
                S/ {Number(item.price).toFixed(2)}
              </span>
            ))}
          </div>
        </section>

        <section className="registration-panel">
          <span className="registration-panel-label">Tipo de inscripción</span>
          <div className="registration-type-grid">
            <button
              type="button"
              className={`registration-type-option ${registrationType === "INDIVIDUAL" ? "registration-type-option-active" : ""}`}
              onClick={() => handleRegistrationTypeChange("INDIVIDUAL")}
            >
              <strong>Individual</strong>
              <span>Un corredor y un voucher.</span>
            </button>
            <button
              type="button"
              className={`registration-type-option ${registrationType === "GROUP" ? "registration-type-option-active" : ""}`}
              onClick={() => handleRegistrationTypeChange("GROUP")}
            >
              <strong>Grupal</strong>
              <span>Varios corredores con pago único o vouchers separados.</span>
            </button>
          </div>
        </section>

        <section className="registration-panel">
          <span className="registration-panel-label">Contacto</span>
          <div className="registration-grid registration-grid-3">
            <label>Nombre de contacto<input value={contact.name} onChange={(e) => setContact((prev) => ({ ...prev, name: e.target.value }))} required /></label>
            <label>Teléfono / WhatsApp<input value={contact.phone} onChange={(e) => setContact((prev) => ({ ...prev, phone: e.target.value }))} /></label>
            <label>Correo<input type="email" value={contact.email} onChange={(e) => setContact((prev) => ({ ...prev, email: e.target.value }))} /></label>
          </div>
        </section>

        <section className="registration-panel">
          <div className="registration-section-title">
            <span className="registration-panel-label">Participantes</span>
            {registrationType === "GROUP" && (
              <button type="button" className="registration-add-btn" onClick={addParticipant}>+ Añadir otro participante</button>
            )}
          </div>

          {registrationType === "GROUP" && participants.length > 1 && (
            <div className="registration-runner-summary-list">
              {participants.map((participant, index) => (
                <button
                  key={index}
                  type="button"
                  className={`registration-runner-summary ${activeParticipantIndex === index ? "registration-runner-summary-active" : ""}`}
                  onClick={() => setActiveParticipantIndex(index)}
                >
                  <strong>{participant.nombre || `Participante ${index + 1}`}</strong>
                  <span>{participant.documento || "Documento pendiente"} · {participant.distancia || "Distancia"}{participantPhotos[index] ? " · Foto lista" : ""}</span>
                </button>
              ))}
            </div>
          )}

          {participants.map((participant, index) => (
            <div key={index} className={`registration-runner-card ${registrationType === "GROUP" && activeParticipantIndex !== index ? "registration-runner-card-hidden" : ""}`}>
              <div className="registration-runner-head">
                <strong>Participante {index + 1}</strong>
                {registrationType === "GROUP" && participants.length > 1 && (
                  <button type="button" onClick={() => removeParticipant(index)}>Quitar</button>
                )}
              </div>
              <div className="registration-grid registration-grid-4">
                <label>Documento de identidad<input value={participant.documento} onChange={(e) => setParticipant(index, "documento", e.target.value)} required /><small className="registration-field-help">Usa el documento real. Se usará para validar inscripción, resultados y certificados.</small></label>
                <label>Nombre completo<input value={participant.nombre} onChange={(e) => setParticipant(index, "nombre", e.target.value)} required /></label>
                <label>Fecha de nacimiento<input type="date" value={participant.birthDate} onClick={openDatePicker} onChange={(e) => setParticipant(index, "birthDate", e.target.value)} required /></label>
                <label>Categoria<select value={getParticipantCategory(participant)} disabled><option value=""></option>{categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select>{Number.isFinite(getParticipantAge(participant)) && <small className="registration-field-help">Edad al dia de carrera: {getParticipantAge(participant)} anos</small>}</label>
                <label>Género<select value={participant.genero} onChange={(e) => setParticipant(index, "genero", e.target.value)}><option value="M">Masculino</option><option value="F">Femenino</option></select></label>
                <label>Distancia<select value={participant.distancia} onChange={(e) => setParticipant(index, "distancia", e.target.value)} required>{race.distances.map((distance) => <option key={distance} value={distance}>{distance}</option>)}</select></label>
                <label>Procedencia<input placeholder="Ciudad / distrito" value={participant.procedencia} onChange={(e) => setParticipant(index, "procedencia", e.target.value)} required /></label>
                <label>Tipo de sangre<select value={participant.bloodType} onChange={(e) => setParticipant(index, "bloodType", e.target.value)} required><option value="">Seleccionar</option>{BLOOD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
                <label>Prenda<select value={participant.garmentType} onChange={(e) => setParticipant(index, "garmentType", e.target.value)} required><option value="POLO">Polo</option><option value="BIVIDI">Bividi</option></select></label>
                <label>Talla<select value={participant.garmentSize} onChange={(e) => setParticipant(index, "garmentSize", e.target.value)} required><option value="">Seleccionar</option>{GARMENT_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
                <label>Club<input placeholder="Opcional" value={participant.club} onChange={(e) => setParticipant(index, "club", e.target.value)} /></label>
                <label>Contacto emergencia<input value={participant.emergencyName} onChange={(e) => setParticipant(index, "emergencyName", e.target.value)} /></label>
                <label>Teléfono emergencia<input value={participant.emergencyPhone} onChange={(e) => setParticipant(index, "emergencyPhone", e.target.value)} /></label>
              </div>
              <label className="registration-voucher-drop registration-photo-drop">
                <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(e) => setParticipantPhoto(index, e.target.files?.[0] || null)} />
                <span>{participantPhotos[index]?.name || "Subir foto de bienvenida JPG, PNG o WEBP (opcional)"}</span>
              </label>
            </div>
          ))}
        </section>

        <section className="registration-panel">
          <span className="registration-panel-label">Pago</span>
          {registrationType === "GROUP" ? (
            <div className="registration-pay-mode">
              <label><input type="radio" checked={paymentMode === "ONE_VOUCHER"} onChange={() => setPaymentMode("ONE_VOUCHER")} /> Un solo voucher para todo el grupo</label>
              <label><input type="radio" checked={paymentMode === "MULTIPLE_VOUCHERS"} onChange={() => setPaymentMode("MULTIPLE_VOUCHERS")} /> Un voucher por participante</label>
            </div>
          ) : (
            <p className="registration-payment-note">Para inscripción individual, sube el voucher correspondiente a este corredor.</p>
          )}
          <div className="registration-kit-benefits">
            <div>
              <span className="registration-kit-eyebrow">Tu inscripción incluye</span>
              <strong>Kit oficial del corredor</strong>
              <p>
                El pago corresponde a tu kit de competencia: chip, dorsal, polo y medalla finisher,
                además de los beneficios de la expo y de nuestros auspiciadores.
              </p>
            </div>
            <ul>
              <li>Chip</li>
              <li>Dorsal</li>
              <li>Polo</li>
              <li>Medalla finisher</li>
              <li>Expo y auspiciadores</li>
            </ul>
          </div>
          {race.registrationInstructions && (
            <p className="registration-instructions">{race.registrationInstructions}</p>
          )}
          {(bankAccounts.length > 0 || digitalWallets.length > 0) && (
            <div className="registration-payment-methods">
              {bankAccounts.length > 0 && (
                <div className="registration-payment-method-section">
                  <h3>Cuentas bancarias</h3>
                  <div className="registration-payment-method-grid">
                    {bankAccounts.map((account, index) => (
                      <article key={`${account.bank}-${index}`} className="registration-payment-method-card">
                        <strong>{account.bank || "Cuenta bancaria"}</strong>
                        {account.holder && <span>Titular: {account.holder}</span>}
                        {account.accountNumber && <span>Cuenta: {account.accountNumber}</span>}
                        {account.cci && <span>CCI: {account.cci}</span>}
                        {account.currency && <span>Moneda: {account.currency}</span>}
                        {account.notes && <small>{account.notes}</small>}
                      </article>
                    ))}
                  </div>
                </div>
              )}
              {digitalWallets.length > 0 && (
                <div className="registration-payment-method-section">
                  <h3>Billetera digital</h3>
                  <div className="registration-payment-method-grid registration-wallet-grid">
                    {digitalWallets.map((wallet, index) => (
                      <article key={`${wallet.type}-${wallet.phone}-${index}`} className="registration-payment-method-card registration-wallet-card">
                        <div className="registration-wallet-info">
                          <strong>{wallet.type || "Billetera"}</strong>
                          {wallet.holder && <span>Titular: {wallet.holder}</span>}
                          {wallet.phone && <span>Numero: {wallet.phone}</span>}
                          {wallet.notes && <small>{wallet.notes}</small>}
                        </div>
                        {wallet.qrPath && (
                          <a className="registration-payment-qr-link" href={api.getAssetUrl(wallet.qrPath)} target="_blank" rel="noreferrer">
                            <img className="registration-payment-qr" src={api.getAssetUrl(wallet.qrPath)} alt={`QR ${wallet.type || "billetera"}`} />
                          </a>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {discountsEnabled && (
            <div className="registration-discount-box">
              <label>
                Codigo de descuento
                <div className="registration-discount-input">
                  <input
                    value={discountCodeInput}
                    onChange={(event) => {
                      setDiscountCodeInput(event.target.value.toUpperCase().replace(/\s+/g, ""));
                      setAppliedDiscount(null);
                      setDiscountMessage("");
                    }}
                    placeholder="PRIMEROLA"
                  />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={applyDiscountCode}>
                    Aplicar
                  </button>
                </div>
              </label>
              {discountMessage && <small className="registration-field-help">{discountMessage}</small>}
            </div>
          )}
          <label className="registration-voucher-drop">
            <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple={registrationType === "GROUP"} onChange={(e) => setVouchers(Array.from(e.target.files || []))} />
            <span>{vouchers.length ? `${vouchers.length} archivo(s) seleccionado(s)` : "Subir voucher JPG, PNG, WEBP o PDF"}</span>
          </label>
          <textarea className="registration-notes" rows="3" placeholder="Comentario opcional para el organizador" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </section>

        {race.registrationRulesPdfPath && (
          <section className="registration-panel registration-rules-panel">
            <span className="registration-panel-label">Bases de la carrera</span>
            <label className="registration-rules-check">
              <input
                type="checkbox"
                checked={rulesAccepted}
                onChange={(event) => {
                  if (event.target.checked) {
                    setShowRulesDialog(true);
                  } else {
                    setRulesAccepted(false);
                  }
                }}
              />
              <span>Acepto haber leido las bases de la carrera y las condiciones de participacion.</span>
            </label>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowRulesDialog(true)}>
              Ver bases
            </button>
          </section>
        )}

        {error && <div className="registration-error-card">{error}</div>}

        <button className="registration-submit" type="submit" disabled={busy || !race.registrationsEnabled}>
          {busy ? "Enviando..." : "Enviar inscripción"}
        </button>
      </form>
      {showRulesDialog && (
        <div className="registration-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Bases de la carrera">
          <div className="registration-rules-dialog">
            <div className="registration-rules-dialog-head">
              <div>
                <span className="registration-panel-label">Bases de la carrera</span>
                <h2>{race.registrationRulesPdfOriginalName || race.name}</h2>
              </div>
              <button type="button" onClick={() => setShowRulesDialog(false)} aria-label="Cerrar">X</button>
            </div>
            <iframe title="Bases de la carrera" src={rulesPdfSrc} />
            <div className="registration-rules-dialog-actions">
              <a className="btn btn-secondary" href={rulesPdfSrc} target="_blank" rel="noreferrer">Abrir PDF</a>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setRulesAccepted(true);
                  setShowRulesDialog(false);
                  setError("");
                }}
              >
                Acepto las bases
              </button>
            </div>
          </div>
        </div>
      )}
      {showPhotoReminder && (
        <div className="registration-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Foto de bienvenida pendiente">
          <div className="registration-photo-reminder-dialog">
            <span className="registration-panel-label">Foto de bienvenida</span>
            <h2>Tu foto es opcional, pero ayuda a personalizar tu bienvenida.</h2>
            <p>
              No has subido foto para {participants.filter((_, index) => !participantPhotos[index]).length} participante(s).
              Puedes agregarla ahora o continuar con la inscripcion sin foto.
            </p>
            <div className="registration-rules-dialog-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowPhotoReminder(false);
                  const firstMissing = participants.findIndex((_, index) => !participantPhotos[index]);
                  if (firstMissing >= 0) setActiveParticipantIndex(firstMissing);
                }}
              >
                Agregar foto
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setPhotoReminderAccepted(true);
                  setShowPhotoReminder(false);
                  window.setTimeout(() => {
                    document.querySelector(".registration-form")?.requestSubmit();
                  }, 0);
                }}
              >
                Continuar sin foto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
