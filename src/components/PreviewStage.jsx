import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AlertTriangle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Minus, Plus,
  ListMusic, Printer, Settings2, Loader2, Maximize2,
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

function ZoomControl({ scale, pageScale, setZoom }) {
  const percent = Math.round(scale * 100);
  const basePresets = [25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300, 400, 500];
  const presets = basePresets.includes(percent)
    ? basePresets
    : [...basePresets, percent].sort((a, b) => a - b);

  const stepZoom = (direction) => {
    const step = 25;
    const currentPercent = Math.round(scale * 100);
    let nextPercent;
    if (direction > 0) {
      nextPercent = Math.floor(currentPercent / step) * step + step;
      if (nextPercent <= currentPercent) {
        nextPercent += step;
      }
    } else {
      nextPercent = Math.ceil(currentPercent / step) * step - step;
      if (nextPercent >= currentPercent) {
        nextPercent -= step;
      }
    }
    nextPercent = Math.max(25, Math.min(500, nextPercent));
    setZoom((nextPercent / 100) / pageScale);
  };

  return (
    <div className="zoom-control" role="group" aria-label="Zoom">
      <button
        type="button"
        className="zoom-btn"
        onClick={() => stepZoom(-1)}
        aria-label="Zoom out"
        title="Zoom out (-25%)"
      >
        <Minus size={16} />
      </button>
      <select
        className="zoom-select"
        value={percent}
        onChange={(e) => {
          const p = Number(e.target.value);
          setZoom((p / 100) / pageScale);
        }}
        aria-label="Zoom level"
      >
        {presets.map((p) => (
          <option key={p} value={p}>{p}%</option>
        ))}
      </select>
      <button
        type="button"
        className="zoom-btn"
        onClick={() => stepZoom(1)}
        aria-label="Zoom in"
        title="Zoom in (+25%)"
      >
        <Plus size={16} />
      </button>
      <button
        type="button"
        className="zoom-btn zoom-fit-btn"
        onClick={() => setZoom(1)}
        title="Fit to screen"
        aria-label="Fit to screen"
      >
        <Maximize2 size={15} />
      </button>
    </div>
  );
}

export function PreviewStage({
  result,
  settings,
  currentPage,
  onPageChange,
  onOpenSettings,
  reflowing,
}) {
  const stageRef = useRef(null);
  const innerRef = useRef(null);
  const [stageSize, setStageSize] = useState({ width: 900, height: 700 });
  const [zoom, setZoom] = useState(1);
  const [domOverflow, setDomOverflow] = useState(false);
  const sheetRef = useRef(null);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const updateSize = (entry) => {
      const observedBox = entry?.borderBoxSize;
      const borderBox = Array.isArray(observedBox) ? observedBox[0] : observedBox;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const innerEl = innerRef.current;
      const innerStyle = innerEl ? getComputedStyle(innerEl) : null;
      const px = (value) => Number.parseFloat(value) || 0;
      const horizontalInsets = px(style.paddingLeft) + px(style.paddingRight)
        + px(style.borderLeftWidth) + px(style.borderRightWidth)
        + (innerStyle ? px(innerStyle.paddingLeft) + px(innerStyle.paddingRight) : 0);
      const verticalInsets = px(style.paddingTop) + px(style.paddingBottom)
        + px(style.borderTopWidth) + px(style.borderBottomWidth)
        + (innerStyle ? px(innerStyle.paddingTop) + px(innerStyle.paddingBottom) : 0);
      const hasBorderBox = borderBox?.inlineSize != null && borderBox?.blockSize != null;
      const hasRect = rect.width > 0 || rect.height > 0;
      const width = hasBorderBox
        ? borderBox.inlineSize - horizontalInsets
        : hasRect
          ? rect.width - horizontalInsets
          : entry?.contentRect?.width ?? el.clientWidth;
      const height = hasBorderBox
        ? borderBox.blockSize - verticalInsets
        : hasRect
          ? rect.height - verticalInsets
          : entry?.contentRect?.height ?? el.clientHeight;
      const next = {
        width: Math.max(0, width),
        height: Math.max(0, height),
      };
      setStageSize((current) => (
        current.width === next.width && current.height === next.height ? current : next
      ));
    };
    const observer = new ResizeObserver(([entry]) => updateSize(entry));
    observer.observe(el, { box: 'border-box' });
    updateSize();
    return () => observer.disconnect();
  }, []);

  const page = result?.pages?.[currentPage];
  const geometry = result?.geometry;
  const appliedSettings = result?.settings ?? settings;

  useLayoutEffect(() => {
    if (page?.type !== 'song') {
      sheetRef.current = null;
      setDomOverflow(false);
      return;
    }
    const sheet = stageRef.current?.querySelector('.song-sheet');
    sheetRef.current = sheet;
    if (!sheet || !sheet.clientHeight || !sheet.clientWidth) {
      setDomOverflow(false);
      return;
    }
    setDomOverflow(
      sheet.scrollWidth > sheet.clientWidth + 2 || sheet.scrollHeight > sheet.clientHeight + 2,
    );
  }, [page, geometry, appliedSettings]);

  const activeOverflow = page?.type === 'song' && Boolean(page.overflow?.overflows || domOverflow);
  const activeOverflowLines = page?.overflow?.overflowLines ?? 0;
  const totalOverflowCount = result?.overflowCount ?? 0;

  const pageScale = geometry
    ? Math.min(
      Math.max(0.2, stageSize.width / geometry.widthPx),
      Math.max(0.2, stageSize.height / geometry.heightPx),
      1,
    )
    : 0.7;
  const scale = pageScale * zoom;
  const pageWidth = geometry ? geometry.widthPx * scale : 500;
  const pageHeight = geometry ? geometry.heightPx * scale : 700;

  return (
    <section className="preview-pane">
      <div className="preview-stage" ref={stageRef}>
        <div className="stage-grain" aria-hidden="true" />
        <div className="preview-stage-inner" ref={innerRef}>
          {!result && (
            <div className="stage-loading">
              <div className="loading-orbit"><Loader2 size={26} className="spin" /></div>
              <strong>Preparing the preview…</strong>
              <p>Building the song pages.</p>
            </div>
          )}
          {result && page && (
            <div className="paper-frame" style={{ width: `${pageWidth}px`, height: `${pageHeight}px` }}>
              <div className="paper-clip">
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
              </div>
              <div className="paper-shadow" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
      {reflowing && result && (
        <div className="reflow-overlay">
          <Loader2 size={17} className="spin" />
          <span>Reflowing pages…</span>
        </div>
      )}

      {activeOverflow && (
        <div className="overflow-banner" role="status">
          <AlertTriangle size={15} className="overflow-banner-icon" aria-hidden="true" />
          <span className="overflow-banner-text">
            {activeOverflowLines > 0
              ? `This song clips past the bottom margin (~${activeOverflowLines} ${activeOverflowLines === 1 ? 'line' : 'lines'}). Lower font size or margins.`
              : 'This song clips past the bottom margin. Lower font size or margins.'}
          </span>
          {onOpenSettings && (
            <button type="button" className="overflow-banner-btn" onClick={onOpenSettings}>
              Adjust settings
            </button>
          )}
        </div>
      )}

      <div className="preview-toolbar">
        <div className="preview-toolbar-left">
          {result && <PageNavigator currentPage={currentPage} pageCount={result.pageCount} onChange={onPageChange} />}
        </div>
        <div className="preview-toolbar-right">
          <ZoomControl scale={scale} pageScale={pageScale} setZoom={setZoom} />
        </div>
      </div>
    </section>
  );
}
