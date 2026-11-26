import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search, X, Printer, ArrowRight, ListMusic } from 'lucide-react';

export function SongDrawer({ open, onClose, result, currentPage, onSelect, onPrint }) {
  const [query, setQuery] = useState('');
  const [onlyOverflowing, setOnlyOverflowing] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setOnlyOverflowing(false);
    }
  }, [open]);

  const overflowCount = result?.overflowCount ?? 0;

  const entries = useMemo(() => {
    if (!result) return [];
    const q = query.trim().toLocaleLowerCase();
    const ordered = result.tocEntries ?? result.songbook.songs.map((song, index) => ({
      songIndex: index,
      number: song.bookNumber ?? index + 1,
      name: song.name,
      author: song.author || song.interpreter || null,
      tonalKey: song.tonalKey ?? null,
      id: song.id ?? null,
    }));
    return ordered.map((entry) => {
      const song = result.songbook.songs[entry.songIndex];
      const firstPage = result.firstPages[entry.songIndex] ?? 1;
      const overflow = result.overflowBySongIndex?.[entry.songIndex] ?? null;
      return { entry, song, index: entry.songIndex, firstPage, overflow };
    }).filter(({ song, overflow }) => {
      if (!song) return false;
      if (onlyOverflowing && overflowCount > 0 && !overflow?.overflows) return false;
      if (!q) return true;
      return `${song.name} ${song.author ?? ''} ${song.interpreter ?? ''}`.toLocaleLowerCase().includes(q);
    });
  }, [result, query, onlyOverflowing, overflowCount]);

  if (!open) return null;

  return (
    <div className="drawer-layer" role="dialog" aria-modal="true" aria-label="Songbook contents">
      <button type="button" className="drawer-backdrop" onClick={onClose} aria-label="Close contents" />
      <div className="song-drawer">
        <header className="drawer-head modal-head">
          <div className="modal-head-title">
            <span className="modal-head-icon" aria-hidden="true"><ListMusic size={16} /></span>
            <h2>Contents</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        {overflowCount > 0 && (
          <div className="drawer-overflow-alert" role="status">
            <span className="drawer-overflow-summary">
              <AlertTriangle size={14} aria-hidden="true" />
              <span>
                {overflowCount} {overflowCount === 1 ? 'song clips' : 'songs clip'} past bottom margin
              </span>
            </span>
            <button
              type="button"
              className={`drawer-overflow-filter${onlyOverflowing ? ' is-active' : ''}`}
              onClick={() => setOnlyOverflowing((v) => !v)}
              aria-pressed={onlyOverflowing}
            >
              {onlyOverflowing ? 'Show all' : 'Clipping only'}
            </button>
          </div>
        )}
        <div className="drawer-list">
          {entries.length === 0 && (
            <p className="drawer-empty">
              {onlyOverflowing
                ? 'No clipping songs match your search.'
                : `No songs match “${query}”.`}
            </p>
          )}
          {entries.map(({ entry, song, index, firstPage, overflow }) => {
            const active = currentPage === firstPage - 1;
            const clips = Boolean(overflow?.overflows);
            return (
              <button
                type="button"
                className={`drawer-row${active ? ' is-active' : ''}${clips ? ' is-overflowing' : ''}`}
                onClick={() => {
                  onSelect(firstPage - 1);
                  onClose();
                }}
                key={song.id ?? index}
              >
                <span className="drawer-number">{String(entry.number ?? song.bookNumber ?? index + 1).padStart(2, '0')}</span>
                <span className="drawer-song">
                  <span className="drawer-song-name">{song.name}</span>
                  <span className="drawer-song-meta">
                    {song.author || song.interpreter || 'Unknown author'}
                    {song.tonalKey ? ` · ${song.tonalKey}` : ''}
                  </span>
                </span>
                {clips && (
                  <span
                    className="drawer-overflow-badge"
                    title={`Clips past bottom margin (~${overflow.overflowLines} ${overflow.overflowLines === 1 ? 'line' : 'lines'})`}
                  >
                    <AlertTriangle size={11} strokeWidth={2.3} aria-hidden="true" />
                    <span>Clips</span>
                  </span>
                )}
                <span className="drawer-page">{firstPage}</span>
                <ArrowRight size={13} className="drawer-arrow" />
              </button>
            );
          })}
        </div>
        <footer className="drawer-foot">
          <div className="drawer-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a song or author…"
              spellCheck="false"
              aria-label="Find a song"
            />
            {query && (
              <button
                type="button"
                className="drawer-search-clear"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
            <span>{entries.length}</span>
          </div>
          <div className="drawer-foot-actions">
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label="Close contents"
            >
              <X size={18} />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
