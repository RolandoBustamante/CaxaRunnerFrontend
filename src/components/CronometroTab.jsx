import { useState } from "react";
import { formatTime } from "../utils/categories";

export default function CronometroTab({ raceClosed, finishers, elapsed, race }) {
  const [copied, setCopied] = useState(false);

  async function handleCopyLink() {
    if (!race?.slug) return;

    const publicUrl = `${window.location.origin}/timer/${encodeURIComponent(race.slug)}`;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="crono-tab">
      {race?.slug && (
        <div className="crono-public-actions">
          <button type="button" className="btn btn-secondary" onClick={handleCopyLink}>
            Copiar enlace publico
          </button>
          {copied && <span className="crono-copy-ok">Enlace copiado</span>}
        </div>
      )}
      <div className={`crono-clock ${raceClosed ? "crono-clock-closed" : ""}`}>
        {formatTime(Math.max(0, elapsed ?? 0), true, true)}
      </div>
      <div className="crono-meta">
        <span className="crono-count">{finishers.length}</span>
        <span className="crono-count-label">atletas en meta</span>
      </div>
    </div>
  );
}
