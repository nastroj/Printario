import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { calculatePdfEta } from '../lib/pdfEta.js';

export function PdfProgressDialog({ progress, onCancel }) {
  const loopStartRef = useRef(null);
  const lastSampleRef = useRef({ current: 0, remainingMs: null, label: 'Estimating…' });

  const current = progress?.current ?? 0;
  const total = progress?.total ?? 0;
  const providedElapsedMs = progress?.elapsedMs;

  useEffect(() => {
    if (!progress || current <= 0) {
      loopStartRef.current = null;
      lastSampleRef.current = { current: 0, remainingMs: null, label: 'Estimating…' };
    } else if (loopStartRef.current == null) {
      loopStartRef.current = performance.now();
    }
  }, [progress, current]);

  if (!progress) {
    loopStartRef.current = null;
    lastSampleRef.current = { current: 0, remainingMs: null, label: 'Estimating…' };
    return null;
  }

  const percent = total > 0
    ? Math.round((current / total) * 100)
    : 0;

  if (current <= 0 || current < lastSampleRef.current.current) {
    loopStartRef.current = current > 0 ? performance.now() : null;
    lastSampleRef.current = { current: 0, remainingMs: null, label: 'Estimating…' };
  } else if (loopStartRef.current == null) {
    loopStartRef.current = performance.now();
  }

  let etaLabel = lastSampleRef.current.label;
  if (current <= 0 || total <= 0) {
    etaLabel = 'Estimating…';
  } else {
    const fallbackElapsed = loopStartRef.current != null ? performance.now() - loopStartRef.current : 0;
    const elapsedMs = Number.isFinite(providedElapsedMs) ? providedElapsedMs : fallbackElapsed;
    if (lastSampleRef.current.current !== current) {
      const nextEta = calculatePdfEta({
        current,
        total,
        elapsedMs,
        prevRemainingMs: lastSampleRef.current.remainingMs,
      });
      lastSampleRef.current = {
        current,
        remainingMs: nextEta.remainingMs,
        label: nextEta.label,
      };
      etaLabel = nextEta.label;
    }
  }

  return (
    <div
      className="confirm-layer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-progress-title"
    >
      <div className="confirm-backdrop" />
      <div className="confirm-dialog pdf-progress-dialog">
        <div className="confirm-head">
          <span className="confirm-icon export-icon" aria-hidden="true">
            <Loader2 size={18} className="spin" />
          </span>
          <div className="confirm-copy">
            <h3 id="pdf-progress-title">Generating PDF…</h3>
            <p>
              {current > 0 ? (
                <>
                  Page {current} of {total}
                  {progress.pageName ? ` · ${progress.pageName}` : ''}
                </>
              ) : (
                'Preparing pages…'
              )}
            </p>
          </div>
        </div>
        <div className="pdf-progress-row">
          <div
            className="pdf-progress-bar-track"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="pdf-progress-bar-fill"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="pdf-progress-eta" aria-live="polite">
            {etaLabel}
          </span>
        </div>
        <div className="confirm-actions">
          <button
            type="button"
            className="confirm-cancel-btn pdf-cancel-btn"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
