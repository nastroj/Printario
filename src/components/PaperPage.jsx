import { SongPageContent } from './SongView.jsx';

function CoverPage({ book, settings }) {
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  const nameLength = book.name.length;
  const titleFactor = nameLength > 74 ? 0.071 : nameLength > 52 ? 0.083 : nameLength > 34 ? 0.097 : 0.116;
  const description = book.description
    ? (book.description.length > 250 ? `${book.description.slice(0, 249).trimEnd()}…` : book.description)
    : null;
  return (
    <div className="cover-page" style={{ '--cover-title-factor': String(titleFactor) }}>
      <div className="cover-orbit cover-orbit-a" aria-hidden="true" />
      <div className="cover-orbit cover-orbit-b" aria-hidden="true" />
      <div className="cover-topline">
        <span>Printario edition</span>
        <span>{date}</span>
      </div>
      <div className="cover-center">
        <div className="cover-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="cover-kicker">{book.projectName || 'A songbook'}</p>
        <h1 className="cover-title">{book.name}</h1>
        {description && <p className="cover-description">{description}</p>}
        <div className="cover-rule" aria-hidden="true" />
        <p className="cover-count">
          {book.songs.length} {book.songs.length === 1 ? 'song' : 'songs'} · set for singing &amp; playing
        </p>
      </div>
      <div className="cover-footer">
        <span>Made with Printario</span>
        <span className="cover-footer-dot" aria-hidden="true" />
        <span>kytario.com</span>
      </div>
    </div>
  );
}

function ContentsPage({ page, book, settings }) {
  const entries = page.entries;
  const half = Math.ceil(entries.length / 2);
  const columns = [entries.slice(0, half), entries.slice(half)];
  return (
    <div className="contents-page">
      <header className="contents-header">
        <p className="contents-kicker">{book.name}</p>
        <div className="contents-title-row">
          <h1>Contents</h1>
          <span>{book.songs.length} songs</span>
        </div>
      </header>
      <div className="contents-columns">
        {columns.map((column, columnIndex) => (
          <ol className="contents-list" key={columnIndex} start={columnIndex === 0 ? 1 : half + 1}>
            {column.map((entry) => (
              <li className="contents-entry" key={entry.songIndex}>
                <span className="contents-number">{String(entry.number).padStart(2, '0')}</span>
                <span className="contents-name">
                  <span className="contents-title">{entry.name}</span>
                  {entry.author && <span className="contents-author">{entry.author}</span>}
                </span>
                <span className="contents-dots" aria-hidden="true" />
                {settings.pageNumbers && <span className="contents-page-number">{entry.page}</span>}
              </li>
            ))}
          </ol>
        ))}
      </div>
      <div className="contents-footer">
        <span>{book.projectName || 'Printario'}</span>
        <span>Compiled with Printario</span>
      </div>
    </div>
  );
}

function PageFooter({ page, book, settings }) {
  if (!settings.pageNumbers) return null;
  return (
    <footer className="page-footer">
      <span className="footer-book">{book.name}</span>
      <span className="footer-page">{page.number}</span>
    </footer>
  );
}

export function PaperPage({ page, book, settings, geometry, className = '' }) {
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
      {page.type === 'cover' && <CoverPage book={book} settings={settings} />}
      {page.type === 'contents' && <ContentsPage page={page} book={book} settings={settings} />}
      {page.type === 'song' && (
        <>
          <div className="page-content">
            <SongPageContent page={page} settings={settings} geometry={geometry} />
          </div>
          <PageFooter page={page} book={book} settings={settings} />
        </>
      )}
    </article>
  );
}
