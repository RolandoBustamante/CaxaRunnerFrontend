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

function pricesToText(prices) {
  if (!Array.isArray(prices)) return "";
  return prices
    .map((item) => {
      const base = `${String(item.distance || "").toUpperCase()}=${Number(item.price || 0)}`;
      const label = String(item.label || "").trim();
      return label ? `${base}|${label}` : base;
    })
    .join(", ");
}

function parsePricesText(value) {
  return String(value || "")
    .split(",")
    .map((chunk) => {
      const [distance, priceAndLabel] = chunk.split("=");
      const [price, label] = String(priceAndLabel || "").split("|");
      return {
        distance: String(distance || "").trim().toUpperCase(),
        price: Number(String(price || "").trim()),
        label: String(label || "").trim() || null,
      };
    })
    .filter((item) => item.distance && Number.isFinite(item.price) && item.price >= 0);
}

function normalizeNotificationContacts(value) {
  if (!Array.isArray(value) || value.length === 0) return [{ name: "", phone: "" }];
  return value.map((item) => {
    if (typeof item === "object" && item !== null) {
      return {
        name: String(item.name || "").trim(),
        phone: String(item.phone || "").replace(/\D/g, ""),
      };
    }
    return {
      name: "",
      phone: String(item || "").replace(/\D/g, ""),
    };
  });
}

function compactNotificationContacts(value) {
  const seen = new Set();
  return value
    .map((item) => ({
      name: String(item.name || "").trim(),
      phone: String(item.phone || "").replace(/\D/g, ""),
    }))
    .filter((item) => {
      if (item.phone.length < 9 || seen.has(item.phone)) return false;
      seen.add(item.phone);
      return true;
    });
}

function emptyNotificationContact() {
  return { name: "", phone: "" };
}

function emptyBankAccount() {
  return { bank: "", holder: "", accountNumber: "", cci: "", currency: "PEN", notes: "" };
}

function emptyDigitalWallet() {
  return { type: "YAPE", phone: "", holder: "", qrPath: "", notes: "" };
}

function normalizePaymentMethods(value) {
  return {
    bankAccounts: Array.isArray(value?.bankAccounts) && value.bankAccounts.length > 0
      ? value.bankAccounts.map((item) => ({ ...emptyBankAccount(), ...item }))
      : [emptyBankAccount()],
    digitalWallets: Array.isArray(value?.digitalWallets) && value.digitalWallets.length > 0
      ? value.digitalWallets.map((item) => ({ ...emptyDigitalWallet(), ...item }))
      : [emptyDigitalWallet()],
  };
}

function compactPaymentMethods(value) {
  const bankAccounts = value.bankAccounts
    .map((item) => ({
      bank: item.bank.trim(),
      holder: item.holder.trim(),
      accountNumber: item.accountNumber.trim(),
      cci: item.cci.trim(),
      currency: item.currency.trim().toUpperCase() || "PEN",
      notes: item.notes.trim(),
    }))
    .filter((item) => item.bank || item.holder || item.accountNumber || item.cci);
  const digitalWallets = value.digitalWallets
    .map((item) => ({
      type: item.type.trim().toUpperCase() || "YAPE",
      phone: item.phone.replace(/\D/g, ""),
      holder: item.holder.trim(),
      qrPath: item.qrPath,
      notes: item.notes.trim(),
    }))
    .filter((item) => item.phone || item.holder || item.qrPath || item.notes);
  return { bankAccounts, digitalWallets };
}

function emptyDiscountForm() {
  return { code: "", discountType: "PERCENT", percent: "", amountPerParticipant: "", maxUses: "", validUntil: "", active: true };
}

function getDiscountDescription(discountCode) {
  if (discountCode.discountType === "FIXED_PER_PARTICIPANT") {
    return `S/ ${Number(discountCode.amountPerParticipant || 0).toFixed(2)} por corredor`;
  }
  return `${Number(discountCode.percent || 0).toFixed(2)}%`;
}

function formatDiscountDate(value) {
  if (!value) return "Sin vencimiento";
  return new Date(value).toLocaleDateString("es-PE", { timeZone: "UTC" });
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
  const [distancesText, setDistancesText] = useState(
    Array.isArray(race?.distances) ? race.distances.join(", ") : ""
  );
  const [certificatesEnabled, setCertificatesEnabled] = useState(race?.certificatesEnabled !== false);
  const [showDorsalPublic, setShowDorsalPublic] = useState(race?.showDorsalPublic !== false);
  const [certificateTemplate, setCertificateTemplate] = useState(race?.certificateTemplate || "classic");
  const [registrationsEnabled, setRegistrationsEnabled] = useState(race?.registrationsEnabled === true);
  const [discountsEnabled, setDiscountsEnabled] = useState(race?.discountsEnabled === true);
  const [registrationPricesText, setRegistrationPricesText] = useState(pricesToText(race?.registrationPrices));
  const [registrationInstructions, setRegistrationInstructions] = useState(race?.registrationInstructions || "");
  const [registrationNotificationContacts, setRegistrationNotificationContacts] = useState(() => normalizeNotificationContacts(race?.registrationNotificationPhones));
  const [whatsappContactPrefix, setWhatsappContactPrefix] = useState(race?.whatsappContactPrefix || "MM-");
  const [paymentMethods, setPaymentMethods] = useState(() => normalizePaymentMethods(race?.registrationPaymentMethods));
  const [uploadingQr, setUploadingQr] = useState(null);
  const [uploadingRaceAsset, setUploadingRaceAsset] = useState("");
  const [discountCodes, setDiscountCodes] = useState([]);
  const [discountForm, setDiscountForm] = useState(() => emptyDiscountForm());

  const distanceOptions = useMemo(() => {
    const raceDistances = Array.isArray(race?.distances) ? race.distances : [];
    const rowDistances = rows.map((row) => String(row.distance || "").trim().toUpperCase()).filter(Boolean);
    return [...new Set([...raceDistances, ...rowDistances])].sort();
  }, [race?.distances, rows]);

  useEffect(() => {
    setRows(normalizeRows(categories));
    setEventDate(toDateInputValue(race?.eventDate));
    setPublicNotice(race?.publicNotice || "");
    setDistancesText(Array.isArray(race?.distances) ? race.distances.join(", ") : "");
    setCertificatesEnabled(race?.certificatesEnabled !== false);
    setShowDorsalPublic(race?.showDorsalPublic !== false);
    setCertificateTemplate(race?.certificateTemplate || "classic");
    setRegistrationsEnabled(race?.registrationsEnabled === true);
    setDiscountsEnabled(race?.discountsEnabled === true);
    setRegistrationPricesText(pricesToText(race?.registrationPrices));
    setRegistrationInstructions(race?.registrationInstructions || "");
    setRegistrationNotificationContacts(normalizeNotificationContacts(race?.registrationNotificationPhones));
    setWhatsappContactPrefix(race?.whatsappContactPrefix || "MM-");
    setPaymentMethods(normalizePaymentMethods(race?.registrationPaymentMethods));
    setMsg(null);
  }, [categories, race?.certificateTemplate, race?.certificatesEnabled, race?.discountsEnabled, race?.distances, race?.eventDate, race?.publicNotice, race?.registrationInstructions, race?.registrationNotificationPhones, race?.registrationPaymentMethods, race?.registrationPrices, race?.registrationsEnabled, race?.showDorsalPublic, race?.whatsappContactPrefix]);

  async function loadDiscountCodes() {
    if (!raceId) return;
    try {
      const data = await api.getDiscountCodes(raceId);
      setDiscountCodes(data.discountCodes || []);
    } catch (err) {
      setMsg({ type: "error", text: err.message || "No se pudieron cargar los descuentos." });
    }
  }

  useEffect(() => {
    loadDiscountCodes();
  }, [raceId]);

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

  function updateBankAccount(index, field, value) {
    setPaymentMethods((prev) => ({
      ...prev,
      bankAccounts: prev.bankAccounts.map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: value } : item
      )),
    }));
    setMsg(null);
  }

  function addBankAccount() {
    setPaymentMethods((prev) => ({ ...prev, bankAccounts: [...prev.bankAccounts, emptyBankAccount()] }));
    setMsg(null);
  }

  function removeBankAccount(index) {
    setPaymentMethods((prev) => ({
      ...prev,
      bankAccounts: prev.bankAccounts.length > 1
        ? prev.bankAccounts.filter((_, itemIndex) => itemIndex !== index)
        : [emptyBankAccount()],
    }));
    setMsg(null);
  }

  function updateDigitalWallet(index, field, value) {
    setPaymentMethods((prev) => ({
      ...prev,
      digitalWallets: prev.digitalWallets.map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: value } : item
      )),
    }));
    setMsg(null);
  }

  function addDigitalWallet() {
    setPaymentMethods((prev) => ({ ...prev, digitalWallets: [...prev.digitalWallets, emptyDigitalWallet()] }));
    setMsg(null);
  }

  function removeDigitalWallet(index) {
    setPaymentMethods((prev) => ({
      ...prev,
      digitalWallets: prev.digitalWallets.length > 1
        ? prev.digitalWallets.filter((_, itemIndex) => itemIndex !== index)
        : [emptyDigitalWallet()],
    }));
    setMsg(null);
  }

  function updateNotificationContact(index, field, value) {
    setRegistrationNotificationContacts((prev) => (
      prev.map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: value } : item
      ))
    ));
    setMsg(null);
  }

  function addNotificationContact() {
    setRegistrationNotificationContacts((prev) => [...prev, emptyNotificationContact()]);
    setMsg(null);
  }

  function removeNotificationContact(index) {
    setRegistrationNotificationContacts((prev) => (
      prev.length > 1 ? prev.filter((_, itemIndex) => itemIndex !== index) : [emptyNotificationContact()]
    ));
    setMsg(null);
  }

  async function uploadWalletQr(index, file) {
    if (!raceId || !file) return;
    setUploadingQr(index);
    setMsg(null);
    try {
      const result = await api.uploadPaymentQr(raceId, file);
      updateDigitalWallet(index, "qrPath", result.qrPath || "");
      setMsg({ type: "ok", text: "QR cargado correctamente. Guarda los datos para publicarlo." });
    } catch (err) {
      setMsg({ type: "error", text: err.message || "No se pudo subir el QR." });
    } finally {
      setUploadingQr(null);
    }
  }

  async function uploadRaceRulesPdf(file) {
    if (!raceId || !file) return;
    setUploadingRaceAsset("rules");
    setMsg(null);
    try {
      await api.uploadRaceRulesPdf(raceId, file);
      setMsg({ type: "ok", text: "Bases de la carrera cargadas." });
      await onRaceUpdated?.();
    } catch (err) {
      setMsg({ type: "error", text: err.message || "No se pudo subir el PDF." });
    } finally {
      setUploadingRaceAsset("");
    }
  }

  async function uploadRaceLogo(file) {
    if (!raceId || !file) return;
    setUploadingRaceAsset("logo");
    setMsg(null);
    try {
      await api.uploadRaceLogo(raceId, file);
      setMsg({ type: "ok", text: "Logo de carrera cargado." });
      await onRaceUpdated?.();
    } catch (err) {
      setMsg({ type: "error", text: err.message || "No se pudo subir el logo." });
    } finally {
      setUploadingRaceAsset("");
    }
  }

  async function clearRaceAsset(field) {
    if (!raceId) return;
    const payload = field === "rules"
      ? { registrationRulesPdfPath: null, registrationRulesPdfOriginalName: null }
      : { raceLogoPath: null, raceLogoOriginalName: null };
    setBusy(true);
    setMsg(null);
    try {
      await api.updateRace(raceId, payload);
      setMsg({ type: "ok", text: field === "rules" ? "Bases retiradas del formulario." : "Logo retirado del formulario." });
      await onRaceUpdated?.();
    } catch (err) {
      setMsg({ type: "error", text: err.message || "No se pudo actualizar la carrera." });
    } finally {
      setBusy(false);
    }
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
    const distances = [
      ...new Set(
        distancesText
          .split(",")
          .map((distance) => distance.trim().toUpperCase())
          .filter(Boolean)
      ),
    ];

    setBusy(true);
    try {
      await api.updateRace(raceId, {
        eventDate: eventDate || null,
        publicNotice: publicNotice.trim() || null,
        distances,
        certificatesEnabled,
        showDorsalPublic,
        certificateTemplate,
        registrationsEnabled,
        discountsEnabled,
        registrationPrices: parsePricesText(registrationPricesText),
        registrationInstructions: registrationInstructions.trim() || null,
        registrationNotificationPhones: compactNotificationContacts(registrationNotificationContacts),
        whatsappContactPrefix: whatsappContactPrefix.trim() || "MM-",
        registrationPaymentMethods: compactPaymentMethods(paymentMethods),
      });
      setMsg({ type: "ok", text: "Datos de la carrera guardados." });
      await onRaceUpdated?.();
    } catch (err) {
      setMsg({ type: "error", text: err.message || "No se pudo guardar la información de la carrera." });
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateDiscount(event) {
    event.preventDefault();
    if (!raceId) return;
    const code = discountForm.code.trim().toUpperCase().replace(/\s+/g, "");
    const discountType = discountForm.discountType === "FIXED_PER_PARTICIPANT" ? "FIXED_PER_PARTICIPANT" : "PERCENT";
    const percent = discountType === "PERCENT" ? Number(discountForm.percent) : 0;
    const amountPerParticipant = discountType === "FIXED_PER_PARTICIPANT" ? Number(discountForm.amountPerParticipant) : null;
    const maxUses = discountForm.maxUses === "" ? null : Number.parseInt(discountForm.maxUses, 10);

    if (!code) {
      setMsg({ type: "error", text: "Ingresa el codigo de descuento." });
      return;
    }
    if (discountType === "PERCENT" && (!Number.isFinite(percent) || percent <= 0 || percent > 100)) {
      setMsg({ type: "error", text: "El porcentaje debe estar entre 1 y 100." });
      return;
    }
    if (discountType === "FIXED_PER_PARTICIPANT" && (!Number.isFinite(amountPerParticipant) || amountPerParticipant <= 0)) {
      setMsg({ type: "error", text: "El monto fijo por corredor debe ser mayor a 0." });
      return;
    }
    if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses <= 0)) {
      setMsg({ type: "error", text: "El limite de usos debe ser mayor a 0." });
      return;
    }

    setBusy(true);
    try {
      await api.createDiscountCode({
        code,
        discountType,
        percent,
        amountPerParticipant,
        maxUses,
        validUntil: discountForm.validUntil || null,
        active: discountForm.active,
      }, raceId);
      setDiscountForm(emptyDiscountForm());
      setMsg({ type: "ok", text: "Codigo de descuento creado." });
      await loadDiscountCodes();
    } catch (err) {
      setMsg({ type: "error", text: err.message || "No se pudo crear el descuento." });
    } finally {
      setBusy(false);
    }
  }

  async function toggleDiscountCode(discountCode) {
    setBusy(true);
    try {
      await api.updateDiscountCode(discountCode.id, { active: !discountCode.active }, raceId);
      setMsg({ type: "ok", text: discountCode.active ? "Codigo desactivado." : "Codigo activado." });
      await loadDiscountCodes();
    } catch (err) {
      setMsg({ type: "error", text: err.message || "No se pudo actualizar el descuento." });
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
            <label className="config-date-field config-distances-field">
              <span>Distancias</span>
              <input
                className="config-input"
                type="text"
                value={distancesText}
                onChange={(event) => {
                  setDistancesText(event.target.value);
                  setMsg(null);
                }}
                placeholder="Ej: 5K, 10K"
              />
            </label>
            <label className="config-checkbox-field">
              <input
                type="checkbox"
                checked={certificatesEnabled}
                onChange={(event) => {
                  setCertificatesEnabled(event.target.checked);
                  setMsg(null);
                }}
              />
              <span>Generar certificados en resultados publicos</span>
            </label>
            <label className="config-checkbox-field">
              <input
                type="checkbox"
                checked={showDorsalPublic}
                onChange={(event) => {
                  setShowDorsalPublic(event.target.checked);
                  setMsg(null);
                }}
              />
              <span>Mostrar dorsal en resultados publicos</span>
            </label>
            <label className="config-date-field config-distances-field">
              <span>Diseño de certificado</span>
              <select
                className="config-input"
                value={certificateTemplate}
                onChange={(event) => {
                  setCertificateTemplate(event.target.value);
                  setMsg(null);
                }}
                disabled={!certificatesEnabled}
              >
                <option value="classic">Clásico</option>
                <option value="trail">Trail verde</option>
              </select>
            </label>
            <label className="config-checkbox-field">
              <input
                type="checkbox"
                checked={registrationsEnabled}
                onChange={(event) => {
                  setRegistrationsEnabled(event.target.checked);
                  setMsg(null);
                }}
              />
              <span>Habilitar formulario de inscripciones</span>
            </label>
            <label className="config-checkbox-field">
              <input
                type="checkbox"
                checked={discountsEnabled}
                onChange={(event) => {
                  setDiscountsEnabled(event.target.checked);
                  setMsg(null);
                }}
                disabled={!registrationsEnabled}
              />
              <span>Mostrar y permitir codigos de descuento</span>
            </label>
            <label className="config-date-field config-distances-field">
              <span>Precios por distancia</span>
              <input
                className="config-input"
                type="text"
                value={registrationPricesText}
                onChange={(event) => {
                  setRegistrationPricesText(event.target.value);
                  setMsg(null);
                }}
                placeholder="Ej: 5K=50|Preventa, 10K=70|Venta regular"
              />
              <small className="config-field-help">Usa | para mostrar una etiqueta como Preventa, Venta regular o Últimos cupos.</small>
            </label>
            <label className="config-notice-field">
              <span>Instrucciones de pago para inscripciones</span>
              <textarea
                className="config-input config-notice-textarea"
                rows="4"
                value={registrationInstructions}
                onChange={(event) => {
                  setRegistrationInstructions(event.target.value);
                  setMsg(null);
                }}
                placeholder="Ej: Yape/Plin 999 999 999 a nombre de Cajamarca Runners. Adjunta tu voucher legible."
              />
            </label>
            <div className="payment-methods-config">
              <div className="payment-methods-section">
                <div className="payment-methods-head">
                  <div>
                    <span>Cuentas bancarias</span>
                    <small>Datos visibles en el formulario publico.</small>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addBankAccount}>
                    + Agregar cuenta
                  </button>
                </div>
                {paymentMethods.bankAccounts.map((account, index) => (
                  <div key={index} className="payment-method-card">
                    <div className="payment-method-grid">
                      <label>
                        <span>Banco</span>
                        <input className="config-input" value={account.bank} onChange={(event) => updateBankAccount(index, "bank", event.target.value)} placeholder="BCP" />
                      </label>
                      <label>
                        <span>Titular</span>
                        <input className="config-input" value={account.holder} onChange={(event) => updateBankAccount(index, "holder", event.target.value)} placeholder="Nombre del titular" />
                      </label>
                      <label>
                        <span>Numero de cuenta</span>
                        <input className="config-input" value={account.accountNumber} onChange={(event) => updateBankAccount(index, "accountNumber", event.target.value)} placeholder="000-0000000-0-00" />
                      </label>
                      <label>
                        <span>CCI</span>
                        <input className="config-input" value={account.cci} onChange={(event) => updateBankAccount(index, "cci", event.target.value)} placeholder="Opcional" />
                      </label>
                      <label>
                        <span>Moneda</span>
                        <input className="config-input" value={account.currency} onChange={(event) => updateBankAccount(index, "currency", event.target.value.toUpperCase())} placeholder="PEN" />
                      </label>
                      <label>
                        <span>Nota</span>
                        <input className="config-input" value={account.notes} onChange={(event) => updateBankAccount(index, "notes", event.target.value)} placeholder="Opcional" />
                      </label>
                    </div>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeBankAccount(index)}>
                      Quitar cuenta
                    </button>
                  </div>
                ))}
              </div>

              <div className="payment-methods-section">
                <div className="payment-methods-head">
                  <div>
                    <span>Billetera digital</span>
                    <small>Yape, Plin u otra billetera con QR opcional.</small>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addDigitalWallet}>
                    + Agregar billetera
                  </button>
                </div>
                {paymentMethods.digitalWallets.map((wallet, index) => (
                  <div key={index} className="payment-method-card">
                    <div className="payment-method-grid payment-method-grid-wallet">
                      <label>
                        <span>Tipo</span>
                        <select className="config-input" value={wallet.type} onChange={(event) => updateDigitalWallet(index, "type", event.target.value)}>
                          <option value="YAPE">Yape</option>
                          <option value="PLIN">Plin</option>
                          <option value="OTRO">Otro</option>
                        </select>
                      </label>
                      <label>
                        <span>Numero</span>
                        <input className="config-input" value={wallet.phone} onChange={(event) => updateDigitalWallet(index, "phone", event.target.value.replace(/\D/g, ""))} placeholder="999888777" />
                      </label>
                      <label>
                        <span>Titular</span>
                        <input className="config-input" value={wallet.holder} onChange={(event) => updateDigitalWallet(index, "holder", event.target.value)} placeholder="Nombre del titular" />
                      </label>
                      <label>
                        <span>Nota</span>
                        <input className="config-input" value={wallet.notes} onChange={(event) => updateDigitalWallet(index, "notes", event.target.value)} placeholder="Opcional" />
                      </label>
                    </div>
                    <div className="payment-qr-row">
                      {wallet.qrPath ? (
                        <img className="payment-qr-preview" src={api.getAssetUrl(wallet.qrPath)} alt={`QR ${wallet.type}`} />
                      ) : (
                        <div className="payment-qr-empty">Sin QR</div>
                      )}
                      <label className="payment-qr-upload">
                        <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => uploadWalletQr(index, event.target.files?.[0])} />
                        <span>{uploadingQr === index ? "Subiendo..." : "Subir QR"}</span>
                      </label>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateDigitalWallet(index, "qrPath", "")} disabled={!wallet.qrPath}>
                        Quitar QR
                      </button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => removeDigitalWallet(index)}>
                        Quitar billetera
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="race-assets-config">
              <div className="race-asset-card">
                <div>
                  <span>Bases de la carrera</span>
                  <small>PDF obligatorio para que el corredor pueda leer y aceptar antes de inscribirse.</small>
                </div>
                {race.registrationRulesPdfPath ? (
                  <a className="race-asset-link" href={api.getAssetUrl(race.registrationRulesPdfPath)} target="_blank" rel="noreferrer">
                    {race.registrationRulesPdfOriginalName || "Ver bases PDF"}
                  </a>
                ) : (
                  <small className="text-muted">Aun no hay PDF configurado.</small>
                )}
                <div className="race-asset-actions">
                  <label className="payment-qr-upload">
                    <input type="file" accept="application/pdf,.pdf" onChange={(event) => uploadRaceRulesPdf(event.target.files?.[0])} />
                    <span>{uploadingRaceAsset === "rules" ? "Subiendo..." : "Subir PDF"}</span>
                  </label>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => clearRaceAsset("rules")} disabled={busy || !race.registrationRulesPdfPath}>
                    Quitar
                  </button>
                </div>
              </div>

              <div className="race-asset-card">
                <div>
                  <span>Logo de la carrera</span>
                  <small>Si existe, se muestra en el formulario publico y en la confirmacion.</small>
                </div>
                {race.raceLogoPath ? (
                  <img className="race-logo-preview" src={api.getAssetUrl(race.raceLogoPath)} alt={race.raceLogoOriginalName || "Logo de carrera"} />
                ) : (
                  <small className="text-muted">Aun no hay logo configurado.</small>
                )}
                <div className="race-asset-actions">
                  <label className="payment-qr-upload">
                    <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => uploadRaceLogo(event.target.files?.[0])} />
                    <span>{uploadingRaceAsset === "logo" ? "Subiendo..." : "Subir logo"}</span>
                  </label>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => clearRaceAsset("logo")} disabled={busy || !race.raceLogoPath}>
                    Quitar
                  </button>
                </div>
              </div>
            </div>
            <div className="notification-contacts-config">
              <div className="payment-methods-head">
                <div>
                  <span>Contactos de aviso para validar pagos</span>
                  <small>Nombre y numero que recibiran la alerta por WhatsApp.</small>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={addNotificationContact}>
                  + Agregar contacto
                </button>
              </div>
              {registrationNotificationContacts.map((contact, index) => (
                <div key={index} className="notification-contact-row">
                  <label>
                    <span>Nombre</span>
                    <input
                      className="config-input"
                      value={contact.name}
                      onChange={(event) => updateNotificationContact(index, "name", event.target.value)}
                      placeholder={`Validador ${index + 1}`}
                    />
                  </label>
                  <label>
                    <span>Numero</span>
                    <input
                      className="config-input"
                      value={contact.phone}
                      onChange={(event) => updateNotificationContact(index, "phone", event.target.value)}
                      placeholder="999888777"
                    />
                  </label>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removeNotificationContact(index)}>
                    Quitar
                  </button>
                </div>
              ))}
            </div>
            <label className="config-date-field config-distances-field">
              <span>Prefijo para contactos WhatsApp</span>
              <input
                className="config-input"
                type="text"
                value={whatsappContactPrefix}
                onChange={(event) => {
                  setWhatsappContactPrefix(event.target.value);
                  setMsg(null);
                }}
                placeholder="Ej: MM-"
              />
              <small className="config-field-help">Se usara al guardar contactos, por ejemplo MM-Rolando Bustamante.</small>
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

      <div className="config-discounts-panel">
        <div className="section-header">
          <div>
            <h2>Codigos de descuento</h2>
            <p className="text-muted">Crea codigos por carrera con porcentaje, cupos y vencimiento opcional.</p>
          </div>
        </div>

        <form className="config-discount-form" onSubmit={handleCreateDiscount}>
          <label>
            <span>Codigo</span>
            <input
              className="config-input"
              value={discountForm.code}
              onChange={(event) => setDiscountForm((prev) => ({ ...prev, code: event.target.value.toUpperCase().replace(/\s+/g, "") }))}
              placeholder="PRIMEROLA"
            />
          </label>
          <label>
            <span>Tipo</span>
            <select
              className="config-input"
              value={discountForm.discountType}
              onChange={(event) => setDiscountForm((prev) => ({ ...prev, discountType: event.target.value }))}
            >
              <option value="PERCENT">Porcentaje</option>
              <option value="FIXED_PER_PARTICIPANT">Monto por corredor</option>
            </select>
          </label>
          {discountForm.discountType === "FIXED_PER_PARTICIPANT" ? (
            <label>
              <span>Monto por corredor</span>
              <input
                className="config-input"
                type="number"
                min="0.01"
                step="0.01"
                value={discountForm.amountPerParticipant}
                onChange={(event) => setDiscountForm((prev) => ({ ...prev, amountPerParticipant: event.target.value }))}
                placeholder="10"
              />
            </label>
          ) : (
            <label>
              <span>Descuento %</span>
              <input
                className="config-input"
                type="number"
                min="1"
                max="100"
                step="0.01"
                value={discountForm.percent}
                onChange={(event) => setDiscountForm((prev) => ({ ...prev, percent: event.target.value }))}
                placeholder="20"
              />
            </label>
          )}
          <label>
            <span>Limite de usos</span>
            <input
              className="config-input"
              type="number"
              min="1"
              value={discountForm.maxUses}
              onChange={(event) => setDiscountForm((prev) => ({ ...prev, maxUses: event.target.value }))}
              placeholder="5"
            />
          </label>
          <label>
            <span>Valido hasta</span>
            <input
              className="config-input"
              type="date"
              value={discountForm.validUntil}
              onChange={(event) => setDiscountForm((prev) => ({ ...prev, validUntil: event.target.value }))}
            />
          </label>
          <label className="config-checkbox-field">
            <input
              type="checkbox"
              checked={discountForm.active}
              onChange={(event) => setDiscountForm((prev) => ({ ...prev, active: event.target.checked }))}
            />
            <span>Activo</span>
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy}>Crear codigo</button>
        </form>

        <div className="config-discount-list">
          {discountCodes.length === 0 ? (
            <p className="text-muted">Aun no hay codigos de descuento para esta carrera.</p>
          ) : discountCodes.map((discountCode) => (
            <div key={discountCode.id} className="config-discount-row">
              <div>
                <strong>{discountCode.code}</strong>
                <span>{getDiscountDescription(discountCode)} · {discountCode.usedCount}/{discountCode.maxUses ?? "sin limite"} corredores · {formatDiscountDate(discountCode.validUntil)}</span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => toggleDiscountCode(discountCode)} disabled={busy}>
                {discountCode.active ? "Desactivar" : "Activar"}
              </button>
            </div>
          ))}
        </div>
      </div>

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
