import { useEffect, useMemo, useState } from 'react';
import { Search, X, Sparkles, Printer, ArrowRight } from 'lucide-react';

export function SongDrawer({ open, onClose, result, currentPage, onSelect, onPrint }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const entries = useMemo(() => {
    if (!result) return [];
    const q = query.trim().toLocaleLowerCase();
    return result.songbook.songs.map((song, index) => {
      const firstPage = result.firstPages[index] ?? 1;
      const fit = result.fits[index];
      return { song, index, firstPage, fit };
    }).filter(({ song }) => {
      if (!q) return true;
      return `${song.name} ${song.author ?? ''} ${song.interpreter ?? ''}`.toLocaleLowerCase().includes(q);
    });
  }, [result, query]);

  if (!open) return null;

  return (
    <div className="drawer-layer" role="dialog" aria-modal="true" aria-label="Songbook contents">
      <button type="button" className="drawer-backdrop" onClick={onClose} aria-label="Close contents" />
      <div className="song-drawer">
        <header className="drawer-head">
          <div>
            <span className="drawer-kicker">{result?.songbook.name ?? 'Songbook'}</span>
            <h2>Contents</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </header>
        <div className="drawer-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a song or author…"
            autoFocus
            spellCheck="false"
            aria-label="Find a song"
          />
          <span>{entries.length}</span>
        </div>
        <div className="drawer-list">
          {entries.length === 0 && <p className="drawer-empty">No songs match “{query}”.</p>}
          {entries.map(({ song, index, firstPage, fit }) => {
            const active = currentPage === firstPage - 1;
            return (
              <button
                type="button"
                className={`drawer-row${active ? ' is-active' : ''}`}
                onClick={() => {
                  onSelect(firstPage - 1);
                  onClose();
                }}
                key={song.id ?? index}
              >
                <span className="drawer-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="drawer-song">
                  <span className="drawer-song-name">{song.name}</span>
                  <span className="drawer-song-meta">
                    {song.author || song.interpreter || 'Unknown author'}
                    {song.tonalKey ? ` · ${song.tonalKey}` : ''}
                  </span>
                </span>
                {fit?.autoFitted && (
                  <span className="drawer-fit"><Sparkles size={10} /> {fit.scale.toFixed(2)}×</span>
                )}
                <span className="drawer-page">{firstPage}</span>
                <ArrowRight size={13} className="drawer-arrow" />
              </button>
            );
          })}
        </div>
        <footer className="drawer-foot">
          <div>
            <strong>{result?.pageCount ?? 0} pages</strong>
            <span>{result?.songbook.songs.length ?? 0} songs</span>
          </div>
          <button type="button" className="primary-button" onClick={onPrint}>
            <Printer size={15} /> Print / PDF
          </button>
        </footer>
      </div>
    </div>
  );
}
