import { Loader2 } from 'lucide-react';

export function PdfProgressDialog({ progress, onCancel }) {
  if (!progress) return null;
  const percent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

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
              {progress.current > 0 ? (
                <>
                  Page {progress.current} of {progress.total}
                  {progress.pageName ? ` · ${progress.pageName}` : ''}
                </>
              ) : (
                'Preparing pages…'
              )}
            </p>
          </div>
        </div>
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
