import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Minus, Plus,
  ListMusic, Printer, Settings2, Loader2,
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
  onToggleSettings,
  settingsOpen,
  onPrint,
  onDownloadPdf,
  pdfGenerating,
  reflowing,
}) {
  const stageRef = useRef(null);
  const [stageSize, setStageSize] = useState({ width: 900, height: 700 });
  const [zoom, setZoom] = useState(1);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const updateSize = (entry) => {
      const observedBox = entry?.borderBoxSize;
      const borderBox = Array.isArray(observedBox) ? observedBox[0] : observedBox;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const px = (value) => Number.parseFloat(value) || 0;
      const horizontalInsets = px(style.paddingLeft) + px(style.paddingRight)
        + px(style.borderLeftWidth) + px(style.borderRightWidth);
      const verticalInsets = px(style.paddingTop) + px(style.paddingBottom)
        + px(style.borderTopWidth) + px(style.borderBottomWidth);
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
        {reflowing && result && (
          <div className="reflow-overlay">
            <Loader2 size={17} className="spin" />
            <span>Reflowing pages…</span>
          </div>
        )}
      </div>

      <div className="preview-toolbar">
        <div className="preview-toolbar-left">
          {result && <PageNavigator currentPage={currentPage} pageCount={result.pageCount} onChange={onPageChange} />}
        </div>
        <div className="preview-toolbar-right">
          <button type="button" className="toolbar-button" onClick={onOpenContents}>
            <ListMusic size={16} /> <span>Contents</span>
          </button>
          <button
            type="button"
            className={`toolbar-button settings-toggle-button${settingsOpen ? ' is-active' : ''}`}
            onClick={onToggleSettings}
            aria-expanded={settingsOpen}
          >
            <Settings2 size={16} /> <span>Settings</span>
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
          <button
            type="button"
            className="toolbar-button header-pdf"
            onClick={onDownloadPdf}
            disabled={!result || reflowing || pdfGenerating}
            title="Download PDF directly"
          >
            <Download size={16} /> <span>PDF</span>
          </button>
          <button
            type="button"
            className="primary-button header-print"
            onClick={onPrint}
            disabled={!result || reflowing || pdfGenerating}
          >
            <Printer size={16} /> <span>Print</span>
          </button>
        </div>
      </div>
    </section>
  );
}
