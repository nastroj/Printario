import { FileText } from 'lucide-react';
import { getColumnCount } from '../lib/settings.js';
import { SongPageContent } from './SongView.jsx';

function CoverPage({ book, columns }) {
  const songCount = book.songs?.length ?? 0;
  const printedOn = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());
  const sourceUrl = typeof book.sourceUrl === 'string' ? book.sourceUrl : '';
  const sourceLabel = sourceUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const qrUrl = !book.singleSong && book.token
    ? `/api/qr/${encodeURIComponent(book.token)}`
    : null;
  const notation = book.songs?.[0]?.notation;
  const notationText = notation === 'english'
    ? 'This songbook uses English notation - tones C-C#-D-Eb-E-F-F#-G-G#-A-Bb-B.'
    : notation === 'german'
      ? 'This songbook uses German notation.'
      : null;

  return (
    <div className="cover-page" data-columns={columns}>
      <div className="cover-main">
        <div className="cover-heading">
          <h1 className="cover-title" translate="no">{book.name}</h1>
          <p className="cover-count">
            {songCount} {songCount === 1 ? 'song' : 'songs'}
            <span className="cover-print-date"> · printed {printedOn}</span>
          </p>
        </div>
        <div className="cover-spacer" aria-hidden="true" />
        {qrUrl && sourceUrl && (
          <div className="cover-qr-row">
            <a className="cover-qr-link" href={sourceUrl} target="_blank" rel="noreferrer">
              <img
                className="cover-qr-image"
                src={qrUrl}
                alt={`QR code for songbook ${book.name}`}
                decoding="sync"
                crossOrigin="anonymous"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </a>
            <a className="cover-source-link" href={sourceUrl} target="_blank" rel="noreferrer">
              <FileText size={17} aria-hidden="true" />
              <span>{sourceLabel}</span>
            </a>
          </div>
        )}
        <div className="cover-spacer" aria-hidden="true" />
      </div>
      <div className="cover-details">
        {notationText && <p>{notationText}</p>}
        <div className="cover-details-rule" aria-hidden="true" />
        <p className="cover-attribution">
          Prepared with Printario for print-ready Kytario songbooks.
          <br />
          Share your book and sing or play together.
        </p>
      </div>
    </div>
  );
}

function ContentsPage({ page, book }) {
  return (
    <div className="contents-page">
      <h1 className="contents-title" translate="no">{book.name}</h1>
      <ul className="contents-list">
        {page.entries.map((entry) => (
          <li className="contents-entry" key={entry.songIndex}>
            <span className="contents-number">{entry.number}</span>
            {' - '}
            {entry.name}
            {entry.author && ` - ${entry.author}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PaperPage({ page, book, settings, geometry, className = '' }) {
  const columns = getColumnCount(settings, geometry);
  const style = {
    '--page-w': String(geometry.widthMm),
    '--page-h': String(geometry.heightMm),
    '--margin-top': String(geometry.marginTop),
    '--margin-right': String(geometry.marginRight),
    '--margin-bottom': String(geometry.marginBottom),
    '--margin-left': String(geometry.marginLeft),
    '--paper-tint': settings.paperTint,
    '--heading-color': settings.headingColor,
    '--lyrics-color': settings.lyricsColor,
    '--chords-color': settings.chordsColor,
    '--font-body': settings.fontFamily === 'lora'
      ? '"Lora Variable", Lora, Georgia, serif'
      : settings.fontFamily === 'mono'
        ? 'Consolas, "Liberation Mono", monospace'
        : '"Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif',
  };

  return (
    <article
      className={`paper-page page-${page.type} ${className}`}
      style={style}
      data-page-number={page.number}
      aria-label={`Page ${page.number}${page.type === 'song' ? ` — ${page.song.name}` : ''}`}
    >
      {page.type === 'cover' && <CoverPage book={book} columns={columns} />}
      {page.type === 'contents' && <ContentsPage page={page} book={book} />}
      {page.type === 'song' && (
        <div className="page-content">
          <SongPageContent page={page} settings={settings} geometry={geometry} />
        </div>
      )}
    </article>
  );
}
