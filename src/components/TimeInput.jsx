import { useState, useRef } from "react";

/**
 * Segmented time input: HH : MM : SS [. cc]
 * value: milliseconds (float) or null
 * onChange(ms | null) — null when input is incomplete/invalid
 * showCentis: show centisecond field (default true)
 */
export default function TimeInput({ value, onChange, disabled, autoFocus, onEnter, showCentis = true }) {
  const toparts = (ms) => {
    if (ms == null || isNaN(ms) || ms < 0) return { hh: "", mm: "", ss: "", cc: "" };
    const total = Math.round(ms);
    const totalSec = Math.floor(total / 1000);
    return {
      hh: String(Math.floor(totalSec / 3600)).padStart(2, "0"),
      mm: String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0"),
      ss: String(totalSec % 60).padStart(2, "0"),
      cc: String(Math.floor((total % 1000) / 10)).padStart(2, "0"),
    };
  };

  const [p, setP] = useState(() => toparts(value));

  const hhRef = useRef();
  const mmRef = useRef();
  const ssRef = useRef();
  const ccRef = useRef();

  const fields = [
    { key: "hh", ref: hhRef, next: mmRef,                sep: ":",          max: 23 },
    { key: "mm", ref: mmRef, next: ssRef,                sep: ":",          max: 59, prev: hhRef },
    { key: "ss", ref: ssRef, next: showCentis ? ccRef : null, sep: showCentis ? "." : null, max: 59, prev: mmRef },
    ...(showCentis ? [{ key: "cc", ref: ccRef, next: null, sep: null, max: 99, prev: ssRef }] : []),
  ];

  const emit = (newP) => {
    const hh = parseInt(newP.hh || "0", 10);
    const mm = parseInt(newP.mm || "0", 10);
    const ss = parseInt(newP.ss || "0", 10);
    const cc = parseInt(newP.cc || "0", 10);
    if (isNaN(hh) || isNaN(mm) || isNaN(ss) || isNaN(cc) || mm >= 60 || ss >= 60 || cc >= 100) {
      onChange(null);
    } else {
      onChange((hh * 3600 + mm * 60 + ss) * 1000 + cc * 10);
    }
  };

  const handleChange = (field, nextRef, raw) => {
    const val = raw.replace(/\D/g, "").slice(0, 2);
    const newP = { ...p, [field]: val };
    setP(newP);
    emit(newP);
    if (val.length === 2 && nextRef) {
      nextRef.current?.select();
      nextRef.current?.focus();
    }
  };

  const handleKeyDown = (e, prevRef) => {
    if (e.key === "Backspace" && e.target.value === "" && prevRef) {
      prevRef.current?.focus();
      prevRef.current?.select();
    }
    if (e.key === "Enter" && onEnter) onEnter();
    if (e.key === "ArrowLeft" && e.target.selectionStart === 0 && prevRef) {
      prevRef.current?.focus();
    }
  };

  return (
    <div className="time-input-group">
      {fields.map(({ key, ref, next, sep, prev }, i) => (
        <span key={key} className="time-input-segment">
          <input
            ref={ref}
            className="time-segment-input"
            type="text"
            inputMode="numeric"
            placeholder="00"
            value={p[key]}
            disabled={disabled}
            autoFocus={autoFocus && i === 0}
            onFocus={(e) => e.target.select()}
            onChange={(e) => handleChange(key, next, e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, prev || null)}
          />
          {sep && <span className="time-sep">{sep}</span>}
        </span>
      ))}
    </div>
  );
}
