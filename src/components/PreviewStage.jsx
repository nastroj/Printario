import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Minus, Plus,
  ListMusic, Printer, Settings2, Sparkles, Loader2,
} from 'lucide-react';
import { PaperPage } from './PaperPage.jsx';

function PageNavigator({ currentPage, pageCount, onChange }) {
  const [draft, setDraft] = useState(String(currentPage + 1));
  useEffect(() => setDraft(String(currentPage + 1)), [currentPage]);

  const commit = () => {
    const n = Number.parseInt(draft, 10);
    if (Number.isFinite(n)) onChange(Math.min(pageCount, Math.max(1, n)) - 1);
    else setDraft(String(currentPage + 1));
  };

  return (
    <div className="page-nav">
      <button type="button" className="mini-icon" onClick={() => onChange(0)} disabled={currentPage === 0} aria-label="First page">
        <ChevronsLeft size={15} />
      </button>
      <button type="button" className="mini-icon" onClick={() => onChange(currentPage - 1)} disabled={currentPage === 0} aria-label="Previous page">
        <ChevronLeft size={15} />
      </button>
      <label className="page-number-input">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ''))}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          aria-label="Page number"
        />
        <span>/ {pageCount}</span>
      </label>
      <button type="button" className="mini-icon" onClick={() => onChange(currentPage + 1)} disabled={currentPage >= pageCount - 1} aria-label="Next page">
        <ChevronRight size={15} />
      </button>
      <button type="button" className="mini-icon" onClick={() => onChange(pageCount - 1)} disabled={currentPage >= pageCount - 1} aria-label="Last page">
        <ChevronsRight size={15} />
      </button>
    </div>
  );
}

export function PreviewStage({
  result,
  settings,
  currentPage,
  onPageChange,
  onOpenContents,
  onOpenSettings,
  onPrint,
  measuring,
  mobile,
}) {
  const stageRef = useRef(null);
  const [stageSize, setStageSize] = useState({ width: 900, height: 700 });
  const [zoom, setZoom] = useState(1);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    setStageSize({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  const page = result?.pages?.[currentPage];
  const geometry = result?.geometry;
  const appliedSettings = result?.settings ?? settings;
  const fitScale = geometry
    ? Math.min(
      Math.max(0.2, (stageSize.width - 64) / geometry.widthPx),
      Math.max(0.2, (stageSize.height - 56) / geometry.heightPx),
      1,
    )
    : 0.7;
  const scale = fitScale * zoom;
  const pageWidth = geometry ? geometry.widthPx * scale : 500;
  const pageHeight = geometry ? geometry.heightPx * scale : 700;
  const activeSongFit = page?.type === 'song' ? page.fit : null;

  return (
    <section className="preview-pane">
      <div className="preview-toolbar">
        <div className="preview-toolbar-left">
          {result && <PageNavigator currentPage={currentPage} pageCount={result.pageCount} onChange={onPageChange} />}
          {activeSongFit && (
            <span className={`fit-chip${activeSongFit.autoFitted ? ' is-fitted' : ''}`} title="Automatic type size for this song">
              <Sparkles size={12} />
              {activeSongFit.autoFitted ? `Auto-fit ${activeSongFit.scale.toFixed(2)}×` : 'Natural size'}
            </span>
          )}
        </div>
        <div className="preview-toolbar-right">
          <button type="button" className="toolbar-button" onClick={onOpenContents}>
            <ListMusic size={15} /> <span>Contents</span>
          </button>
          <button type="button" className="toolbar-button mobile-settings-button" onClick={onOpenSettings}>
            <Settings2 size={15} /> <span>Settings</span>
          </button>
          <div className="zoom-control">
            <button type="button" className="mini-icon" onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))} aria-label="Zoom out">
              <Minus size={14} />
            </button>
            <button type="button" className="zoom-value" onClick={() => setZoom(1)} title="Fit to window">
              {Math.round(scale * 100)}%
            </button>
            <button type="button" className="mini-icon" onClick={() => setZoom((z) => Math.min(2.4, Number((z + 0.1).toFixed(2))))} aria-label="Zoom in">
              <Plus size={14} />
            </button>
          </div>
          <button type="button" className="primary-button toolbar-print" onClick={onPrint}>
            <Printer size={16} /> <span>Print / PDF</span>
          </button>
        </div>
      </div>

      <div className="preview-stage" ref={stageRef}>
        <div className="stage-grain" aria-hidden="true" />
        {!result && (
          <div className="stage-loading">
            <div className="loading-orbit"><Loader2 size={26} className="spin" /></div>
            <strong>Setting the type…</strong>
            <p>Measuring songs and finding their comfy size.</p>
          </div>
        )}
        {result && page && (
          <div className="paper-frame" style={{ width: `${pageWidth}px`, height: `${pageHeight}px` }}>
            <div
              className="paper-scaler"
              style={{
                width: `${geometry.widthPx}px`,
                height: `${geometry.heightPx}px`,
                transform: `scale(${scale})`,
              }}
            >
              <PaperPage
                page={page}
                book={result.songbook}
                settings={appliedSettings}
                geometry={geometry}
              />
            </div>
            <div className="paper-shadow" aria-hidden="true" />
          </div>
        )}
        {measuring && result && (
          <div className="reflow-overlay">
            <Loader2 size={17} className="spin" />
            <span>Reflowing pages…</span>
          </div>
        )}
        {result && (
          <div className="stage-caption">
            <span>{page?.type === 'cover' ? 'Cover' : page?.type === 'contents' ? 'Contents' : page?.song?.name}</span>
            <span>{settings.paper} · {settings.orientation}</span>
          </div>
        )}
      </div>
    </section>
  );
}
