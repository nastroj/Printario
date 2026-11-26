import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download, Info, Plus, Sparkles, X,
} from 'lucide-react';
import { ImportScreen } from './components/ImportScreen.jsx';
import { PreviewStage } from './components/PreviewStage.jsx';
import { SettingsPanel } from './components/SettingsPanel.jsx';
import { SongDrawer } from './components/SongDrawer.jsx';
import { PdfProgressDialog } from './components/PdfProgressDialog.jsx';
import { PdfExportDialog } from './components/PdfExportDialog.jsx';
import { Brand } from './components/Brand.jsx';
import { PaperPage } from './components/PaperPage.jsx';
import { buildBookModel } from './lib/song.js';
import { paginateBook } from './lib/paginate.js';
import { buildSheetSequence } from './lib/imposition.js';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './lib/settings.js';
import { addRecent, cacheSongbook, loadRecent, readCachedSongbook, removeRecent } from './lib/storage.js';

function getLayoutKey(settings) {
  return JSON.stringify({
    paper: settings.paper,
    orientation: settings.orientation,
    columns: settings.columns,
    bookMode: Boolean(settings.bookMode),
    margins: settings.margins,
    fontFamily: settings.fontFamily,
    headingSize: settings.headingSize,
    lyricsSize: settings.lyricsSize,
    chordsSize: settings.chordsSize,
    lineHeight: settings.lineHeight,
    cover: settings.cover,
    contents: settings.contents,
    showMetadata: settings.showMetadata,
    showSectionLines: settings.showSectionLines !== false,
    showSectionLabels: settings.showSectionLabels,
    sectionLabelPosition: settings.sectionLabelPosition ?? 'after',
    songOrder: settings.songOrder,
  });
}

function getAppearance(settings) {
  return {
    headingColor: settings.headingColor,
    lyricsColor: settings.lyricsColor,
    chordsColor: settings.chordsColor,
    ruleColor: settings.ruleColor,
    chorusColor: settings.chorusColor,
    badgeColor: settings.badgeColor,
    paperTint: settings.paperTint,
  };
}

function PrintRoot({ result, settings }) {
  const geometry = result.geometry;
  return (
    <>
      <style>{`@page { size: ${geometry.widthMm}mm ${geometry.heightMm}mm; margin: 0; }`}</style>
      <div className="print-root" aria-hidden="true">
        {result.pages.map((page, index) => (
          <PaperPage
            key={`${page.type}-${index}`}
            page={page}
            book={result.songbook}
            settings={settings}
            geometry={geometry}
            className="print-paper"
          />
        ))}
      </div>
    </>
  );
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`toast${toast.kind === 'error' ? ' is-error' : ''}`} role="status">
      <span className="toast-icon">{toast.kind === 'error' ? <Info size={15} /> : <Sparkles size={15} />}</span>
      <span>{toast.message}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss"><X size={14} /></button>
    </div>
  );
}

function StudioHeader({ book, onNewBook, installPrompt, onInstall }) {
  return (
    <header className="studio-header">
      <div className="studio-brand">
        <Brand compact />
        <span className="header-divider" aria-hidden="true" />
        <div className="studio-book-title">
          <span>Now typesetting</span>
          <strong>{book.name}</strong>
        </div>
      </div>
      <div className="studio-actions">
        {installPrompt && (
          <button type="button" className="header-link" onClick={onInstall}>
            <Download size={15} /> <span>Install app</span>
          </button>
        )}
        <button type="button" className="header-link" onClick={onNewBook} aria-label="New songbook">
          <Plus size={15} /> <span>New songbook</span>
        </button>
      </div>
    </header>
  );
}

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [sourceData, setSourceData] = useState(null);
  const [result, setResult] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [importing, setImporting] = useState(false);
  const [settingsPending, setSettingsPending] = useState(false);
  const [importError, setImportError] = useState(null);
  const [recent, setRecent] = useState(loadRecent);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [printMode, setPrintMode] = useState(false);
  const [toast, setToast] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [pdfExportOpen, setPdfExportOpen] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(null);
  const pdfAbortRef = useRef(null);

  const toastTimer = useRef(null);
  const resultRef = useRef(null);
  const currentPageRef = useRef(0);
  const layoutKey = useMemo(() => getLayoutKey(settings), [settings]);
  const appliedLayoutRef = useRef(layoutKey);
  const book = useMemo(
    () => (sourceData ? buildBookModel(sourceData) : null),
    [sourceData],
  );

  useEffect(() => {
    resultRef.current = result;
  }, [result]);
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  const showToast = useCallback((message, kind = 'info') => {
    setToast({ message, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!sourceData) {
      appliedLayoutRef.current = layoutKey;
      return undefined;
    }

    // Appearance changes do not affect the page structure; apply them immediately
    // even if a layout reflow timer is also pending.
    setResult((current) => (current
      ? { ...current, settings: { ...current.settings, ...getAppearance(settings) } }
      : current));

    if (layoutKey === appliedLayoutRef.current) {
      return undefined;
    }

    setSettingsPending(true);
    const timer = setTimeout(() => {
      appliedLayoutRef.current = layoutKey;
      if (book) {
        const next = paginateBook(book, settings);
        const oldResult = resultRef.current;
        const oldPage = oldResult?.pages?.[currentPageRef.current];
        let target = Math.min(currentPageRef.current, Math.max(0, next.pageCount - 1));
        if (oldPage?.type === 'song') {
          const oldSong = oldResult.songbook?.songs?.[oldPage.songIndex];
          const newIndex = oldSong?.id != null
            ? next.songbook.songs.findIndex((song) => song.id === oldSong.id)
            : -1;
          target = Math.max(0, (next.firstPages[newIndex >= 0 ? newIndex : oldPage.songIndex] ?? 1) - 1);
        }
        setResult(next);
        setCurrentPage(target);
      }
      setSettingsPending(false);
    }, 160);
    return () => clearTimeout(timer);
  }, [settings, layoutKey, sourceData, book]);

  useEffect(() => {
    const handler = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const openData = useCallback((data, { cached = false } = {}) => {
    setSourceData(data);
    setResult(paginateBook(buildBookModel(data), settings));
    setCurrentPage(0);
    setImportError(null);
    appliedLayoutRef.current = layoutKey;
    setSettingsPending(false);
    setRecent(addRecent(data));
    cacheSongbook(data);
    if (cached) showToast('Opened the saved copy of this songbook.');
  }, [settings, layoutKey, showToast]);

  const importFromApi = useCallback(async (url) => {
    const response = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      throw new Error('The server sent an unreadable response. Please try again.');
    }
    if (!response.ok || !payload?.ok) {
      const code = payload?.error?.code;
      // Map server error codes to specific, actionable user-facing guidance so
      // each failure mode explains what to do next (retry vs. fix the link).
      const CODE_HINTS = {
        RATE_LIMITED: 'Wait about a minute, then try again.',
        UPSTREAM_TIMEOUT: 'Kytario is slow right now — this is usually temporary. Please retry in a moment.',
        UPSTREAM_UNREACHABLE: 'We could not reach Kytario at all. Check your internet connection and retry.',
        SONGBOOK_NOT_FOUND: 'Double-check the link: the songbook may be private or renamed.',
        EMPTY_SONGBOOK: 'This songbook has no printable songs yet. Open it on Kytario to confirm.',
        MULTIPLE_SONGBOOKS: 'Open one of the listed songbooks on Kytario and paste that exact link.',
        UNSUPPORTED_HOST: 'Only kytario.com links can be imported.',
      };
      const base = payload?.error?.message || `Import failed (${code ?? response.status}).`;
      const hint = CODE_HINTS[code];
      const candidates = payload?.error?.details?.candidates;
      const extra = Array.isArray(candidates) && candidates.length
        ? ` Try: ${candidates.map((item) => `kytario.com/${item.token}`).join(', ')}`
        : '';
      const error = new Error(`${base}${extra}${hint ? ` ${hint}` : ''}`);
      error.code = code;
      error.retryable = ['RATE_LIMITED', 'UPSTREAM_TIMEOUT', 'UPSTREAM_UNREACHABLE', 'UPSTREAM_ERROR'].includes(code);
      throw error;
    }
    return payload.data;
  }, []);

  const handleImport = useCallback(async (url) => {
    if (!url?.trim()) {
      setImportError('Paste a Kytario songbook link first.');
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      const data = await importFromApi(url.trim());
      openData(data);
    } catch (error) {
      setImportError(error.message || 'That songbook could not be imported.');
    } finally {
      setImporting(false);
    }
  }, [importFromApi, openData]);

  const handleRecent = useCallback(async (item) => {
    setImporting(true);
    setImportError(null);
    try {
      const cached = await readCachedSongbook(item.token);
      if (cached) {
        openData(cached, { cached: true });
        return;
      }
      const data = await importFromApi(item.sourceUrl);
      openData(data);
    } catch (error) {
      setImportError(error.message);
    } finally {
      setImporting(false);
    }
  }, [importFromApi, openData]);

  const handlePrint = useCallback(() => {
    if (!result || settingsPending) return;
    setPrintMode(true);
  }, [result, settingsPending]);

  const handleOpenPdfExport = useCallback(() => {
    if (!result || settingsPending || pdfProgress) return;
    setSettingsOpen(false);
    setDrawerOpen(false);
    setPdfExportOpen(true);
  }, [result, settingsPending, pdfProgress]);

  const handleDownloadPdf = useCallback(async (overridePdfOptions = null) => {
    if (!result || settingsPending || pdfProgress) return;
    const pdfOptions = overridePdfOptions ?? settings.pdfExport;
    const total = pdfOptions?.mode === 'pro'
      ? buildSheetSequence(result.pageCount, pdfOptions).length
      : result.pageCount;

    setPdfExportOpen(false);
    const controller = new AbortController();
    pdfAbortRef.current = controller;
    setPdfProgress({ current: 0, total, pageName: 'Starting…' });

    try {
      const { exportSongbookPdf } = await import('./lib/pdf.js');
      const exportStartedAt = performance.now();
      const { filename, fontFallback } = await exportSongbookPdf({
        result,
        pdfOptions,
        onProgress: (p) => setPdfProgress(p),
        signal: controller.signal,
      });
      // Structured client-side telemetry for export latency and font fallbacks.
      console.info('[printario] pdf export', {
        filename,
        pages: total,
        mode: pdfOptions?.mode ?? 'standard',
        durationMs: Math.round(performance.now() - exportStartedAt),
        fontFallback,
      });
      if (fontFallback) {
        showToast('Downloaded PDF, but the embedded font failed to load — Helvetica metrics were used instead.', 'error');
      } else {
        showToast(`Downloaded ${filename}`, 'info');
      }
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError' || error?.message === 'Export cancelled') {
        showToast('PDF export cancelled.', 'info');
      } else {
        console.error('PDF export failed:', error);
        showToast(error.message || 'Failed to generate PDF.', 'error');
      }
    } finally {
      setPdfProgress(null);
      pdfAbortRef.current = null;
    }
  }, [result, settingsPending, pdfProgress, settings.pdfExport, showToast]);

  const handleCancelDownloadPdf = useCallback(() => {
    if (pdfAbortRef.current) {
      pdfAbortRef.current.abort();
    }
  }, []);

  const handleRemoveRecent = useCallback((item) => {
    if (!item?.token) return;
    setRecent(removeRecent(item.token));
  }, []);

  useEffect(() => {
    if (!printMode) return undefined;
    let cancelled = false;
    let finishTimer = null;

    const finish = () => {
      if (cancelled) return;
      if (finishTimer) {
        clearTimeout(finishTimer);
        finishTimer = null;
      }
      setPrintMode(false);
    };

    const startPrint = async () => {
      if (cancelled) return;
      // Bound the font wait: on slow mobile networks web fonts can take many
      // seconds to download, which delays the print trigger and can error out.
      // Give the browser a short window for fonts, then print with system
      // fallback fonts; the line scaler adjusts text metrics after mount.
      try {
        await Promise.race([
          document.fonts?.ready ?? Promise.resolve(),
          new Promise((resolve) => setTimeout(resolve, 2500)),
        ]);
      } catch {
        // no-op
      }
      if (cancelled) return;

      requestAnimationFrame(() => {
        if (cancelled) return;
        try {
          if (typeof window.print !== 'function') {
            throw new Error('Printing is not supported in this browser.');
          }
          window.addEventListener('afterprint', finish, { once: true });
          finishTimer = setTimeout(finish, 10000);
          window.print();
        } catch (error) {
          showToast(
            error.message || "Saving the PDF failed. Try the browser's Print → Save as PDF.",
            'error',
          );
          setPrintMode(false);
        }
      });
    };

    const timer = setTimeout(startPrint, 90);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(finishTimer);
      window.removeEventListener('afterprint', finish);
    };
  }, [printMode, showToast]);

  useEffect(() => {
    if (!result) return undefined;
    const handler = (event) => {
      if (event.key === 'Escape' && settingsOpen) {
        if (document.querySelector('[data-color-picker-modal="true"]')) return;
        setSettingsOpen(false);
        return;
      }
      const tag = event.target?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        handlePrint();
        return;
      }
      if (drawerOpen || settingsOpen) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setCurrentPage((page) => Math.min(result.pageCount - 1, page + 1));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setCurrentPage((page) => Math.max(0, page - 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [result, drawerOpen, settingsOpen, handlePrint]);

  const updateSetting = useCallback((key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
  }, []);

  const updateMargins = useCallback((side, value) => {
    setSettings((current) => {
      if (side === null) return { ...current, margins: { ...value } };
      return { ...current, margins: { ...current.margins, [side]: value } };
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS, margins: { ...DEFAULT_SETTINGS.margins } });
    showToast('Print settings reset to the studio defaults.');
  }, [showToast]);

  const newBook = useCallback(() => {
    if (pdfAbortRef.current) {
      pdfAbortRef.current.abort();
    }
    setPdfProgress(null);
    setPdfExportOpen(false);
    setSourceData(null);
    setResult(null);
    setCurrentPage(0);
    setImportError(null);
    setSettingsPending(false);
    setDrawerOpen(false);
    setSettingsOpen(false);
    setPrintMode(false);
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    try {
      await installPrompt.userChoice;
    } catch {
      // no-op
    }
    setInstallPrompt(null);
  }, [installPrompt]);

  if (!sourceData) {
    return (
      <>
        <ImportScreen
          onImport={handleImport}
          loading={importing}
          error={importError}
          recent={recent}
          onOpenRecent={handleRecent}
          onRemoveRecent={handleRemoveRecent}
          onDismissError={() => setImportError(null)}
        />
        <Toast toast={toast} onClose={() => setToast(null)} />
      </>
    );
  }

  return (
    <>
      <div className="app-shell">
        <StudioHeader
          book={book}
          onNewBook={newBook}
          installPrompt={installPrompt}
          onInstall={install}
        />
        <div className="studio-body">
          <PreviewStage
            result={result}
            settings={settings}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onOpenContents={() => {
              setSettingsOpen(false);
              setDrawerOpen(true);
            }}
            onOpenSettings={() => {
              setDrawerOpen(false);
              setSettingsOpen(true);
            }}
            onToggleSettings={() => {
              setDrawerOpen(false);
              setSettingsOpen((open) => !open);
            }}
            settingsOpen={settingsOpen}
            onPrint={handlePrint}
            onDownloadPdf={handleOpenPdfExport}
            pdfGenerating={Boolean(pdfProgress)}
            reflowing={settingsPending}
          />
        </div>

        <SongDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          result={result}
          currentPage={currentPage}
          onSelect={setCurrentPage}
        />

        <div
          className={`settings-sheet-layer${settingsOpen ? ' is-open' : ''}`}
          aria-hidden={!settingsOpen}
          inert={!settingsOpen}
        >
          <button
            type="button"
            className="drawer-backdrop"
            onClick={() => setSettingsOpen(false)}
            aria-label="Close settings"
            tabIndex={settingsOpen ? 0 : -1}
          />
          <SettingsPanel
            book={book}
            settings={settings}
            update={updateSetting}
            setMargin={updateMargins}
            onReset={resetSettings}
            onPrint={() => {
              setSettingsOpen(false);
              handlePrint();
            }}
            onDownloadPdf={handleOpenPdfExport}
            pdfGenerating={Boolean(pdfProgress)}
            onClose={() => setSettingsOpen(false)}
          />
        </div>

        <Toast toast={toast} onClose={() => setToast(null)} />
      </div>
      {printMode && result && <PrintRoot result={result} settings={result.settings} />}
      <PdfExportDialog
        isOpen={pdfExportOpen}
        result={result}
        settings={settings}
        onChangePdfOptions={(nextOpts) => updateSetting('pdfExport', nextOpts)}
        onExport={handleDownloadPdf}
        onClose={() => setPdfExportOpen(false)}
      />
      <PdfProgressDialog
        progress={pdfProgress}
        onCancel={handleCancelDownloadPdf}
      />
    </>
  );
}
