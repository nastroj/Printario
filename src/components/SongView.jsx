import { useLayoutEffect, useRef } from 'react';
import {
  FONT_STACKS, KYTARIO_PALETTE, getColumnCount, getTypeScale,
} from '../lib/settings.js';

const NBSP = '\u00a0';
const CHORUS_TITLE_RE = /ref|cho/i;

function styleVars(settings, { columns, typeScale }) {
  const lyricPx = settings.lyricsSize * typeScale;
  const chordPx = settings.chordsSize * typeScale;
  const headingPx = settings.headingSize * typeScale;
  return {
    '--sheet-columns': String(columns),
    '--sheet-font': `${lyricPx}px`,
    '--lyric-font': `${lyricPx}px`,
    '--chord-font': `${chordPx}px`,
    '--heading-font': `${headingPx}px`,
    '--label-font': `${settings.lyricsSize * typeScale * 0.7}px`,
    '--chord-row-h': `${chordPx}px`,
    '--lyric-row-h': `${lyricPx * settings.lineHeight}px`,
    '--font-body': FONT_STACKS[settings.fontFamily]?.stack ?? FONT_STACKS.inter.stack,
    '--heading-color': settings.headingColor,
    '--lyrics-color': settings.lyricsColor,
    '--chords-color': settings.chordsColor,
    '--section-rule': settings.ruleColor ?? KYTARIO_PALETTE.rule,
    '--chorus-rule': settings.chorusColor ?? KYTARIO_PALETTE.chorus,
    '--badge-bg': settings.badgeColor ?? KYTARIO_PALETTE.badge,
  };
}

/**
 * Kytario never wraps a lyric line. Very long lines are scaled down instead,
 * so the chords stay glued to the word they belong to.
 */
function useLineScale() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const available = el.clientWidth;
    if (!available) return;
    const needed = el.scrollWidth;
    const next = needed > available + 0.75
      ? String(available / needed)
      : '1';
    if (el.style.getPropertyValue('--line-scale') !== next) {
      el.style.setProperty('--line-scale', next);
    }
  });
  return ref;
}

function SongHeader({ song, index, settings }) {
  const author = song.author || song.interpreter || null;
  const key = settings.showMetadata && song.tonalKey ? `(${song.tonalKey})` : null;
  return (
    <header className="song-header">
      <span className="song-number" aria-hidden="true">{song.bookNumber ?? index + 1}</span>
      <h1 className="song-title">
        {author ? `${song.name} - ${author}` : song.name}
        {key && <span className="song-key">{key}</span>}
      </h1>
    </header>
  );
}

function InlineItem({ item }) {
  if (item.t === 'chord') return <span className="inline-chord">{item.v}</span>;
  if (item.t === 'bar') return <span className="inline-bar">|</span>;
  if (item.t === 'ref') return <span className="inline-ref">{item.v}</span>;
  if (item.t === 'text') return <span>{item.v}</span>;
  if (item.t === 'space') {
    return <span className="inline-space" style={{ width: `${item.em}em` }} />;
  }
  if (item.t === 'dash') return <span className="inline-dash">-</span>;
  if (item.t === 'repeatStart') {
    return (
      <span className="inline-repeat">
        {' '}
        <span className="repeat-glyph">|∶</span>
        {item.count > 2 ? ` ${item.count}× ` : ' '}
      </span>
    );
  }
  if (item.t === 'repeatEnd') {
    return (
      <span className="inline-repeat">
        {' '}
        <span className="repeat-glyph">∶|</span>
        {item.count > 2 ? ` ${item.count}× ` : ' '}
      </span>
    );
  }
  return null;
}

function ChordLine({ line, showChords }) {
  const ref = useLineScale();
  return (
    <div className={`song-line${showChords ? ' has-chords' : ''}`} ref={ref}>
      {line.segments.map((segment, index) => {
        // `+` sections lose their chords (and bars) in the printed two-column
        // layout, exactly like Kytario.
        if (!showChords && segment.bar) return null;
        if (!showChords && !segment.spaceEm && !segment.text) return null;
        const hasChord = segment.chords.length > 0 || segment.bar;
        return (
          <span className="seg" key={index}>
            {showChords && (
              <span className="seg-chord">
                {segment.bar
                  ? <span className="seg-bar-glyph">|</span>
                  : segment.chords.join(' ')}
              </span>
            )}
            {segment.spaceEm ? (
              <span className="seg-space" style={{ width: `${segment.spaceEm}em` }} />
            ) : (
              <span className="seg-lyric">
                {segment.text || (hasChord ? NBSP : '')}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function InlineLine({ line }) {
  const ref = useLineScale();
  return (
    <div className="song-line inline-line" ref={ref}>
      {line.items.map((item, index) => <InlineItem item={item} key={index} />)}
    </div>
  );
}

function SongSection({ section, settings, hideExpandableChords }) {
  const hideChords = section.expandable && hideExpandableChords;
  const showLabel = settings.showSectionLabels && Boolean(section.title);
  const chorus = CHORUS_TITLE_RE.test(section.title);
  const className = [
    'song-section',
    section.unnamed ? 'is-instrumental' : '',
    chorus ? 'is-chorus' : '',
    section.hasChords ? 'has-chords' : '',
    !hideChords ? 'has-chord-row' : '',
    showLabel ? 'has-label' : 'no-label',
    hideChords ? 'chords-hidden' : '',
  ].filter(Boolean).join(' ');

  return (
    <section className={className}>
      {showLabel && (
        <span className="section-label" aria-hidden="true">
          <span className="section-label-text">{section.title}</span>
        </span>
      )}
      {!showLabel && settings.showSectionLabels && (
        <span className="section-label section-label-spacer" aria-hidden="true" />
      )}
      <div className="section-lines">
        {section.lines.map((line, index) => (
          line.kind === 'inline'
            ? <InlineLine line={line} key={index} />
            : <ChordLine line={line} showChords={!hideChords} key={index} />
        ))}
      </div>
    </section>
  );
}

function SongSheet({ song, index, settings, columns, typeScale, badgeSide }) {
  return (
    <div
      className={`song-sheet is-badge-${badgeSide}`}
      data-columns={columns}
      style={styleVars(settings, { columns, typeScale })}
    >
      <SongHeader song={song} index={index} settings={settings} />
      {song.sections.map((section, sectionIndex) => (
        <SongSection
          section={section}
          settings={settings}
          hideExpandableChords={columns === 2}
          key={sectionIndex}
        />
      ))}
    </div>
  );
}

export function SongPageContent({ page, settings, geometry }) {
  const columns = getColumnCount(settings, geometry);
  const typeScale = getTypeScale(geometry, columns);
  const badgeSide = settings.bookMode && page.number % 2 === 1 ? 'right' : 'left';
  return (
    <SongSheet
      song={page.song}
      index={page.songIndex}
      settings={settings}
      columns={columns}
      typeScale={typeScale}
      badgeSide={badgeSide}
    />
  );
}
