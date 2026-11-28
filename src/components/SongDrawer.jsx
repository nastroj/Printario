import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowRight, ArrowUp, ListMusic, Search, X,
} from 'lucide-react';
import { sortDrawerEntries } from '../lib/settings.js';

function toDrawerSortKey(songOrder) {
  if (songOrder === 'manual') return 'number';
  if (songOrder === 'author') return 'author';
  return 'title';
}

export function SongDrawer({ open, onClose, result, currentPage, onSelect }) {
  const [query, setQuery] = useState('');
  const [onlyOverflowing, setOnlyOverflowing] = useState(false);
  const [sortBy, setSortBy] = useState(() => toDrawerSortKey(result?.settings?.songOrder));
  const [sortDir, setSortDir] = useState('asc');

  const panelRef = useRef(null);
  const desktopInputRef = useRef(null);

  useEffect(() => {
    setSortBy(toDrawerSortKey(result?.settings?.songOrder));
    setSortDir('asc');
  }, [result?.songbook?.token, result?.settings?.songOrder]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setOnlyOverflowing(false);
      return undefined;
    }

    const panel = panelRef.current;
    if (!panel) return undefined;
    const previous = document.activeElement;

    if (typeof window !== 'undefined' && window.innerWidth > 720 && desktopInputRef.current) {
      desktopInputRef.current.focus();
    } else {
      panel.focus();
    }

    const focusable = () => Array.from(panel.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )).filter((node) => !node.disabled && getComputedStyle(node).display !== 'none');

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener('keydown', onKeyDown);
    return () => {
      panel.removeEventListener('keydown', onKeyDown);
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [open, onClose]);

  const overflowCount = result?.overflowCount ?? 0;

  const handleSortClick = (key) => {
    if (sortBy === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
  };

  const entries = useMemo(() => {
    if (!result) return [];
    const q = query.trim().toLocaleLowerCase();
    const baseEntries = result.songbook.songs.map((song, index) => {
      const firstPage = result.firstPages[index] ?? 1;
      const overflow = result.overflowBySongIndex?.[index] ?? null;
      const number = song.bookNumber ?? index + 1;
      const author = song.author || song.interpreter || null;
      return {
        entry: {
          songIndex: index,
          number,
          name: song.name,
          author,
          tonalKey: song.tonalKey ?? null,
          id: song.id ?? null,
        },
        song,
        index,
        number,
        name: song.name,
        author,
        firstPage,
        overflow,
      };
    });

    const filtered = baseEntries.filter(({ song, overflow }) => {
      if (!song) return false;
      if (onlyOverflowing && overflowCount > 0 && !overflow?.overflows) return false;
      if (!q) return true;
      return `${song.name} ${song.author ?? ''} ${song.interpreter ?? ''}`.toLocaleLowerCase().includes(q);
    });

    return sortDrawerEntries(filtered, sortBy, sortDir);
  }, [result, query, onlyOverflowing, overflowCount, sortBy, sortDir]);

  return (
    <div
      className={`settings-sheet-layer song-drawer-layer${open ? ' is-open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Songbook contents"
      aria-hidden={!open}
      inert={!open}
    >
      <button
        type="button"
        className="drawer-backdrop"
        onClick={onClose}
        aria-label="Close contents"
        tabIndex={open ? 0 : -1}
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        className="settings-panel song-drawer"
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="settings-sheet-head modal-head drawer-head">
          <div className="modal-head-title">
            <span className="modal-head-icon" aria-hidden="true"><ListMusic size={16} /></span>
            <h2>Contents</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close contents"
          >
            <X size={18} />
          </button>
        </div>

        {/* Desktop search bar (moved to top on desktop) */}
        <div className="drawer-search-desktop">
          <div className="drawer-search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={desktopInputRef}
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
        </div>

        <div className="drawer-sort-bar">
          <div className="segmented segmented-3" role="group" aria-label="Sort contents">
            {[
              ['number', 'Number'],
              ['title', 'Song'],
              ['author', 'Artist'],
            ].map(([key, label]) => {
              const active = sortBy === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={`segment${active ? ' is-active' : ''}`}
                  onClick={() => handleSortClick(key)}
                  aria-pressed={active}
                >
                  <span>{label}</span>
                  {active && (sortDir === 'asc'
                    ? <ArrowUp size={12} aria-hidden="true" />
                    : <ArrowDown size={12} aria-hidden="true" />)}
                </button>
              );
            })}
          </div>
        </div>

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
          {/* Mobile search bar (pinned at bottom on mobile) */}
          <div className="drawer-search-mobile">
            <div className="drawer-search">
              <Search size={16} aria-hidden="true" />
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
          </div>

          {/* Desktop quiet summary line */}
          <div className="drawer-foot-summary">
            {result?.songbook?.name ? `${result.songbook.name} · ` : ''}
            {entries.length} {entries.length === 1 ? 'song' : 'songs'}
          </div>

          {/* Mobile close button (permanently visible at bottom on mobile) */}
          <div className="drawer-foot-actions drawer-bottom-close">
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
      </aside>
    </div>
  );
}
