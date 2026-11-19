import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download, Info, Plus, Printer, Settings2, Sparkles, X,
} from 'lucide-react';
import { ImportScreen } from './components/ImportScreen.jsx';
import { MeasurementLayer } from './components/MeasurementLayer.jsx';
import { PreviewStage } from './components/PreviewStage.jsx';
import { SettingsPanel } from './components/SettingsPanel.jsx';
import { SongDrawer } from './components/SongDrawer.jsx';
import { Brand } from './components/Brand.jsx';
import { PaperPage } from './components/PaperPage.jsx';
import { buildBookModel } from './lib/song.js';
import { DEFAULT_SETTINGS, getGeometry, loadSettings, saveSettings } from './lib/settings.js';
import { addRecent, cacheSongbook, loadRecent, readCachedSongbook } from './lib/storage.js';

function getLayoutKey(settings) {
  return JSON.stringify({
    paper: settings.paper,
    orientation: settings.orientation,
    columns: settings.columns,
    margins: settings.margins,
    fontFamily: settings.fontFamily,
    headingSize: settings.headingSize,
    lyricsSize: settings.lyricsSize,
    chordsSize: settings.chordsSize,
    lineHeight: settings.lineHeight,
    cover: settings.cover,
    contents: settings.contents,
    showMetadata: settings.showMetadata,
    showSectionLabels: settings.showSectionLabels,
    autoFit: settings.autoFit,
    autoFitStrength: settings.autoFitStrength,
    autoFitFill: settings.autoFitFill,
    songOrder: settings.songOrder,
  });
}

function getAppearance(settings) {
  return {
    headingColor: settings.headingColor,
    lyricsColor: settings.lyricsColor,
    chordsColor: settings.chordsColor,
    paperTint: settings.paperTint,
    pageNumbers: settings.pageNumbers,
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

function StudioHeader({ book, onNewBook, onPrint, onOpenSettings, installPrompt, onInstall }) {
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
        <button type="button" className="header-link" onClick={onNewBook}>
          <Plus size={15} /> <span>New songbook</span>
        </button>
        <button type="button" className="header-icon-mobile" onClick={onOpenSettings} aria-label="Print settings">
          <Settings2 size={18} />
        </button>
        <button type="button" className="primary-button header-print" onClick={onPrint}>
          <Printer size={16} /> <span>Print / PDF</span>
        </button>
      </div>
    </header>
  );
}

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [appliedSettings, setAppliedSettings] = useState(settings);
  const [sourceData, setSourceData] = useState(null);
  const [result, setResult] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [importing, setImporting] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [settingsPending, setSettingsPending] = useState(false);
  const [measureToken, setMeasureToken] = useState(0);
  const [importError, setImportError] = useState(null);
  const [recent, setRecent] = useState(loadRecent);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [printMode, setPrintMode] = useState(false);
  const [toast, setToast] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);

  const toastTimer = useRef(null);
  const resultRef = useRef(null);
  const currentPageRef = useRef(0);
  const appearanceRef = useRef(getAppearance(settings));
  const layoutKey = useMemo(() => getLayoutKey(settings), [settings]);
  const appliedLayoutRef = useRef(layoutKey);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    appearanceRef.current = getAppearance(settings);
  }, [settings]);

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
      setAppliedSettings(settings);
      appliedLayoutRef.current = layoutKey;
      return undefined;
    }

    // Colors, paper tint and folio visibility don't change geometry. Update the
    // page's appearance without paying for a full measuring pass.
    if (layoutKey === appliedLayoutRef.current) {
      setResult((current) => (current
        ? { ...current, settings: { ...current.settings, ...getAppearance(settings) } }
        : current));
      return undefined;
    }

    setSettingsPending(true);
    const timer = setTimeout(() => {
      appliedLayoutRef.current = layoutKey;
      setAppliedSettings(settings);
      setMeasureToken((token) => token + 1);
      setMeasuring(true);
      setSettingsPending(false);
    }, 160);
    return () => clearTimeout(timer);
  }, [settings, layoutKey, sourceData]);

  useEffect(() => {
    const handler = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const book = useMemo(
    () => (sourceData ? buildBookModel(sourceData, settings.songOrder) : null),
    [sourceData, settings.songOrder],
  );
  const geometry = useMemo(() => getGeometry(appliedSettings), [appliedSettings]);

  const openData = useCallback((data, { cached = false } = {}) => {
    setSourceData(data);
    setResult(null);
    setCurrentPage(0);
    setImportError(null);
    setAppliedSettings(settings);
    appliedLayoutRef.current = layoutKey;
    setMeasureToken((token) => token + 1);
    setSettingsPending(false);
    setMeasuring(true);
    setRecent(addRecent(data));
    if (!data.demo) cacheSongbook(data);
    if (cached) showToast('Opened the saved copy of this songbook.');
  }, [settings, layoutKey, showToast]);

  const handleMeasured = useCallback((next, error) => {
    if (error || !next) {
      setMeasuring(false);
      showToast('The pages could not be measured. Try a different paper size.', 'error');
      return;
    }
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
    setResult({ ...next, settings: { ...next.settings, ...appearanceRef.current } });
    setCurrentPage(target);
    setMeasuring(false);
    const overflowing = (next.fits ?? []).filter((fit) => fit.overflow).length;
    if (overflowing > 0) {
      showToast(
        `${overflowing} ${overflowing === 1 ? 'song is' : 'songs are'} too long for one page, even after shrinking. `
        + 'The preview marks them so you can shorten or split the song.',
        'error',
      );
    }
  }, [showToast]);

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
      const base = payload?.error?.message || `Import failed (${response.status}).`;
      const candidates = payload?.error?.details?.candidates;
      const extra = Array.isArray(candidates) && candidates.length
        ? ` Try: ${candidates.map((item) => `kytario.com/${item.token}`).join(', ')}`
        : '';
      throw new Error(`${base}${extra}`);
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

  const handleDemo = useCallback(async () => {
    setImporting(true);
    setImportError(null);
    try {
      const response = await fetch('/api/demo');
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error('The demo could not be loaded.');
      openData(payload.data);
    } catch (error) {
      setImportError(error.message);
    } finally {
      setImporting(false);
    }
  }, [openData]);

  const handleRecent = useCallback(async (item) => {
    setImporting(true);
    setImportError(null);
    try {
      if (item.demo) {
        await handleDemo();
        return;
      }
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
  }, [handleDemo, importFromApi, openData]);

  const handlePrint = useCallback(() => {
    if (!result || measuring || settingsPending) return;
    setPrintMode(true);
  }, [result, measuring, settingsPending]);

  useEffect(() => {
    if (!printMode) return undefined;
    let cancelled = false;
    const finish = () => {
      if (!cancelled) setPrintMode(false);
    };
    const timer = setTimeout(async () => {
      try {
        await document.fonts?.ready;
      } catch {
        // no-op
      }
      if (cancelled) return;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (cancelled) return;
        window.addEventListener('afterprint', finish, { once: true });
        window.print();
        setTimeout(finish, 10000);
      }));
    }, 90);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [printMode]);

  useEffect(() => {
    if (!result) return undefined;
    const handler = (event) => {
      const tag = event.target?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        handlePrint();
        return;
      }
      if (drawerOpen || mobileSettingsOpen) return;
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
  }, [result, drawerOpen, mobileSettingsOpen, handlePrint]);

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
    setSourceData(null);
    setResult(null);
    setCurrentPage(0);
    setImportError(null);
    setMeasuring(false);
    setSettingsPending(false);
    setDrawerOpen(false);
    setMobileSettingsOpen(false);
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
          onDemo={handleDemo}
          loading={importing}
          error={importError}
          recent={recent}
          onOpenRecent={handleRecent}
          onDismissError={() => setImportError(null)}
        />
        <Toast toast={toast} onClose={() => setToast(null)} />
        {mobileSettingsOpen && null}
      </>
    );
  }

  return (
    <>
      <div className="app-shell">
        <StudioHeader
        book={book}
        onNewBook={newBook}
        onPrint={handlePrint}
        onOpenSettings={() => setMobileSettingsOpen(true)}
        installPrompt={installPrompt}
        onInstall={install}
      />
      <div className="studio-body">
        <SettingsPanel
          book={book}
          settings={settings}
          update={updateSetting}
          setMargin={updateMargins}
          onReset={resetSettings}
          onResetBook={newBook}
          onOpenContents={() => setDrawerOpen(true)}
          onPrint={handlePrint}
        />
        <PreviewStage
          result={result}
          settings={settings}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onOpenContents={() => setDrawerOpen(true)}
          onOpenSettings={() => setMobileSettingsOpen(true)}
          onPrint={handlePrint}
          measuring={measuring || settingsPending}
        />
      </div>

      {book && measuring && (
        <MeasurementLayer
          book={book}
          settings={appliedSettings}
          geometry={geometry}
          onMeasured={handleMeasured}
          key={measureToken}
        />
      )}

      <SongDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        result={result}
        currentPage={currentPage}
        onSelect={setCurrentPage}
        onPrint={() => {
          setDrawerOpen(false);
          handlePrint();
        }}
      />

      {mobileSettingsOpen && (
        <div className="mobile-settings-layer">
          <button type="button" className="drawer-backdrop" onClick={() => setMobileSettingsOpen(false)} aria-label="Close settings" />
          <SettingsPanel
            book={book}
            settings={settings}
            update={updateSetting}
            setMargin={updateMargins}
            onReset={resetSettings}
            onResetBook={() => {
              setMobileSettingsOpen(false);
              newBook();
            }}
            onOpenContents={() => {
              setMobileSettingsOpen(false);
              setDrawerOpen(true);
            }}
            onPrint={() => {
              setMobileSettingsOpen(false);
              handlePrint();
            }}
            isMobile
            onClose={() => setMobileSettingsOpen(false)}
          />
        </div>
      )}

        <Toast toast={toast} onClose={() => setToast(null)} />
      </div>
      {printMode && result && <PrintRoot result={result} settings={result.settings} />}
    </>
  );
}
