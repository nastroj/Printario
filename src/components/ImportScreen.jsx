import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight, ArrowUpRight, BookOpen, Check, Clock3, FileText,
  Link2, Loader2, Printer, Sparkles, Trash2, WandSparkles, X,
} from 'lucide-react';
import { Brand } from './Brand.jsx';

function RecentRow({ item, onOpen, onRequestRemove, disabled }) {
  return (
    <div className="recent-item">
      <button type="button" className="recent-row" onClick={() => onOpen(item)} disabled={disabled}>
        <span className="recent-icon"><BookOpen size={16} /></span>
        <span className="recent-text">
          <span className="recent-name">{item.name}</span>
          <span className="recent-meta">{item.songCount} songs · Kytario</span>
        </span>
        <ArrowUpRight size={15} className="recent-arrow" />
      </button>
      <button
        type="button"
        className="recent-delete"
        onClick={() => onRequestRemove(item)}
        disabled={disabled}
        aria-label={`Delete ${item.name} from recently opened`}
        title={`Remove ${item.name}`}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function ConfirmRemoveDialog({ item, onCancel, onConfirm }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!item) return undefined;
    const previous = document.activeElement;
    dialogRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [item, onCancel]);

  if (!item) return null;

  const dialog = (
    <div
      className="confirm-layer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-remove-title"
      data-confirm-remove-modal="true"
    >
      <div className="confirm-backdrop" onClick={onCancel} aria-hidden="true" />
      <div className="confirm-dialog" ref={dialogRef} tabIndex={-1}>
        <div className="confirm-head">
          <span className="confirm-icon" aria-hidden="true">
            <Trash2 size={18} />
          </span>
          <div className="confirm-copy">
            <h3 id="confirm-remove-title">Remove songbook?</h3>
            <p>
              Remove <strong>{item.name}</strong> from recently opened? Its saved copy on this device will be deleted.
            </p>
          </div>
          <button
            type="button"
            className="cp-close"
            onClick={onCancel}
            aria-label="Cancel removal"
          >
            <X size={16} />
          </button>
        </div>
        <div className="confirm-actions">
          <button type="button" className="confirm-cancel-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="confirm-delete-btn" onClick={onConfirm}>
            <Trash2 size={14} />
            Remove
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' && document.body
    ? createPortal(dialog, document.body)
    : dialog;
}

export function ImportScreen({
  onImport,
  loading,
  error,
  recent,
  onOpenRecent,
  onRemoveRecent,
  onDismissError,
}) {
  const [url, setUrl] = useState('');
  const [focused, setFocused] = useState(false);
  const [confirmItem, setConfirmItem] = useState(null);

  const submit = (event) => {
    event.preventDefault();
    if (loading) return;
    onImport(url);
  };

  const handleConfirmRemove = () => {
    if (!confirmItem) return;
    onRemoveRecent?.(confirmItem);
    setConfirmItem(null);
  };

  return (
    <div className="landing-shell">
      <header className="landing-header">
        <Brand />
        <div className="landing-header-actions">
          <span className="landing-badge"><span className="live-dot" /> Free &amp; private</span>
          <a className="ghost-link" href="https://kytario.com/songbooks" target="_blank" rel="noreferrer">
            Browse songbooks <ArrowUpRight size={14} />
          </a>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-copy">
          <div className="eyebrow"><Sparkles size={14} /> A print studio for Kytario songbooks</div>
          <h1 className="landing-title">
            Your songs,
            <br />
            <span className="landing-title-accent">ready for paper.</span>
          </h1>
          <p className="landing-lede">
            Paste a Kytario songbook link. Printario imports every song and keeps
            chords, lyrics and section spacing true to the original print layout.
          </p>

          <form className={`url-form${focused ? ' is-focused' : ''}`} onSubmit={submit}>
            <div className="url-input-wrap">
              <Link2 size={19} className="url-icon" aria-hidden="true" />
              <input
                type="text"
                inputMode="url"
                autoComplete="url"
                spellCheck="false"
                placeholder="https://kytario.com/your-songbook"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                aria-label="Kytario songbook link"
                disabled={loading}
              />
              {url && !loading && (
                <button type="button" className="url-clear" onClick={() => setUrl('')} aria-label="Clear link">
                  <X size={15} />
                </button>
              )}
            </div>
            <button className="primary-button import-button" type="submit" disabled={loading || !url.trim()}>
              {loading ? <Loader2 size={18} className="spin" /> : <ArrowRight size={18} />}
              {loading ? 'Reading songbook…' : 'Open songbook'}
            </button>
          </form>

          {error && (
            <div className="import-error" role="alert">
              <span className="import-error-icon">!</span>
              <div>
                <strong>That link didn’t open</strong>
                <p>{error}</p>
              </div>
              <button type="button" onClick={onDismissError} aria-label="Dismiss error"><X size={15} /></button>
            </div>
          )}

          <div className="landing-actions">
            <span className="privacy-note"><Check size={13} /> Public songbooks only · No account needed</span>
          </div>

          {recent.length > 0 && (
            <div className="recent-block">
              <div className="recent-heading"><Clock3 size={13} /> Recently opened</div>
              <div className="recent-list">
                {recent.map((item) => (
                  <RecentRow
                    item={item}
                    onOpen={onOpenRecent}
                    onRequestRemove={setConfirmItem}
                    disabled={loading}
                    key={item.token}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="landing-art" aria-hidden="true">
          <div className="art-glow art-glow-a" />
          <div className="art-glow art-glow-b" />
          <div className="book-scene">
            <div className="mock-page mock-page-back">
              <div className="mock-page-head">
                <span>42</span>
                <span>Ref.</span>
              </div>
              <div className="mock-chords">G&nbsp;&nbsp;&nbsp;C&nbsp;&nbsp;&nbsp;D&nbsp;&nbsp;&nbsp;Em</div>
              <div className="mock-line strong">Carry the lantern,</div>
              <div className="mock-line">carry it high</div>
              <div className="mock-gap" />
              <div className="mock-chords">C&nbsp;&nbsp;&nbsp;G&nbsp;&nbsp;&nbsp;D</div>
              <div className="mock-line">Let it paint a window</div>
              <div className="mock-line">on the sky</div>
              <div className="mock-gap" />
              <div className="mock-chords">Am&nbsp;&nbsp;&nbsp;Em&nbsp;&nbsp;&nbsp;C</div>
              <div className="mock-line">Every little crease is a</div>
              <div className="mock-line">place we have been</div>
              <div className="mock-footer"><span>Songs for the Slow Road</span><span>7</span></div>
            </div>
            <div className="mock-page mock-page-front">
              <div className="mock-cover-top"><span>PRINTARIO EDITION</span><span>2026</span></div>
              <div className="mock-cover-center">
                <div className="mock-cover-mark"><i /><i /><i /></div>
                <div className="mock-cover-kicker">PRINTARIO STUDIO</div>
                <div className="mock-cover-title">Songs for<br />the Slow Road</div>
                <div className="mock-cover-rule" />
                <div className="mock-cover-sub">3 songs · set for singing &amp; playing</div>
              </div>
              <div className="mock-cover-bottom"><span>Made with Printario</span><span>kytario.com</span></div>
            </div>
            <div className="floating-chip chip-format">
              <span className="chip-icon"><FileText size={14} /></span>
              <span><strong>A4 · Landscape</strong><small>2 columns · 1 song / page</small></span>
            </div>
          </div>
        </section>
      </main>

      <section className="feature-strip">
        <div className="feature">
          <span className="feature-icon"><BookOpen size={19} /></span>
          <div><strong>Real songbook import</strong><p>Paste a link. Get all songs, sections, chords and all.</p></div>
        </div>
        <div className="feature">
          <span className="feature-icon"><WandSparkles size={19} /></span>
          <div><strong>Faithful song typography</strong><p>Inter, chord placement and section spacing modeled on Kytario.</p></div>
        </div>
        <div className="feature">
          <span className="feature-icon"><Printer size={19} /></span>
          <div><strong>Kytario-style print</strong><p>Two columns, section names in the margin, chords over lyrics. A4, A5, Letter or B5.</p></div>
        </div>
      </section>

      <footer className="landing-footer">
        <span>Printario is an independent tool for Kytario users.</span>
        <span>Made for the campfire, the choir and the band.</span>
      </footer>

      <ConfirmRemoveDialog
        item={confirmItem}
        onCancel={() => setConfirmItem(null)}
        onConfirm={handleConfirmRemove}
      />
    </div>
  );
}
