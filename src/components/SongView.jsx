import { FONT_STACKS } from '../lib/settings.js';
import { displayAuthor, songMetaParts } from '../lib/song.js';

const NBSP = '\u00a0';

function styleVars(settings, scale = 1) {
  return {
    '--base-heading': `${settings.headingSize}px`,
    '--base-lyrics': `${settings.lyricsSize}px`,
    '--base-chord': `${settings.chordsSize}px`,
    '--base-line-height': settings.lineHeight,
    '--song-scale': String(scale),
    '--song-air': String(1 + Math.max(0, scale - 1) * 0.9),
    '--font-body': FONT_STACKS[settings.fontFamily]?.stack ?? FONT_STACKS.inter.stack,
    '--heading-color': settings.headingColor,
    '--lyrics-color': settings.lyricsColor,
    '--chords-color': settings.chordsColor,
  };
}

function SongHeader({ song, index, showMetadata = true }) {
  const meta = songMetaParts(song);
  const hasMeta = showMetadata && meta.length > 0;
  return (
    <header className="song-header" data-song-header>
      <div className="song-header-top">
        <span className="song-number" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <h1 className="song-title">{song.name}</h1>
      </div>
      {hasMeta && <p className="song-meta">{meta.join('  ·  ')}</p>}
      <div className="song-rule" aria-hidden="true">
        <span />
      </div>
    </header>
  );
}

function Line({ line }) {
  if (line.kind === 'gap') {
    return <div className="song-gap" data-line />;
  }
  if (line.kind === 'reference') {
    return (
      <div className="song-reference" data-line>
        <span className="reference-glyph" aria-hidden="true">↻</span>
        <span>{line.label}</span>
      </div>
    );
  }

  const hasChord = line.segments.some((segment) => segment.chord);
  const hasLyric = line.segments.some((segment) => segment.text.trim());
  return (
    <div
      className={[
        'song-line',
        hasChord ? 'with-chords' : 'no-chords',
        hasLyric ? '' : 'chord-only',
      ].filter(Boolean).join(' ')}
      data-line
    >
      {line.prefix && <span className="repeat-mark repeat-start">{line.prefix}</span>}
      {line.segments.map((segment, index) => (
        <span
          className={[
            'seg',
            segment.chord ? 'has-chord' : '',
            segment.chordOnly ? 'chord-only' : '',
          ].filter(Boolean).join(' ')}
          key={index}
        >
          {hasChord && (
            <span className={`seg-chord${segment.chord === 'X' ? ' no-chord' : ''}`}>
              {segment.chord || NBSP}
            </span>
          )}
          {(hasLyric || segment.text) && (
            <span className="seg-lyric">{segment.text || NBSP}</span>
          )}
        </span>
      ))}
      {line.suffix && <span className="repeat-mark repeat-end">{line.suffix}</span>}
    </div>
  );
}

function SectionBody({ section, lineStart = 0, lineEnd = section.lines.length, continued = false, showLabel = true }) {
  const lines = section.lines.slice(lineStart, lineEnd);
  const heading = showLabel && section.title;
  if (!heading && lines.length === 0) return null;
  return (
    <section className="song-section" data-section>
      {heading && (
        <h2 className="section-heading" data-section-heading>
          <span>{section.title}</span>
          {continued && <span className="section-cont">cont.</span>}
        </h2>
      )}
      <div className="section-lines">
        {lines.map((line, index) => (
          <Line line={line} key={index} />
        ))}
      </div>
    </section>
  );
}

export function SongPageContent({ page, settings, totalSongs }) {
  const { song, sections, pageInSong, fit } = page;
  const scale = fit?.scale ?? 1;
  return (
    <div className="song-page-inner" style={styleVars(settings, scale)}>
      {pageInSong === 0 && <SongHeader song={song} index={page.songIndex} showMetadata={settings.showMetadata} />}
      {sections.map((part) => {
        const section = song.sections[part.index];
        if (!section) return null;
        return (
          <SectionBody
            section={section}
            lineStart={part.lineStart}
            lineEnd={part.lineEnd}
            continued={part.continued}
            showLabel={settings.showSectionLabels}
            key={`${part.index}-${part.lineStart}`}
          />
        );
      })}
      {pageInSong > 0 && (
        <div className="page-continuation-mark" aria-hidden="true">
          {song.name} · {pageInSong + 1}/{page.pageCount}
        </div>
      )}
    </div>
  );
}

/**
 * Hidden tree used to measure natural section/line heights and find each
 * song's auto-fit scale.
 */
export function SongMeasureBlock({ song, index, settings }) {
  return (
    <div className="song-page-inner measure-song" data-measure-song data-song-index={index} style={styleVars(settings, 1)}>
      <SongHeader song={song} index={index} showMetadata={settings.showMetadata} />
      {song.sections.map((section, sectionIndex) => (
        <SectionBody
          section={section}
          showLabel={settings.showSectionLabels}
          key={sectionIndex}
        />
      ))}
    </div>
  );
}

export function SongMetaLine({ song }) {
  const author = displayAuthor(song);
  const meta = songMetaParts(song);
  return (
    <span>
      {author ? `${author} · ` : ''}
      {meta.slice(author ? 1 : 0).join(' · ')}
    </span>
  );
}
