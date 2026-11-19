import { useLayoutEffect, useRef } from 'react';
import {
  FONT_STACKS, KYTARIO_PALETTE, getColumnCount, getTypeScale,
} from '../lib/settings.js';

const NBSP = '\u00a0';
const CHORUS_TITLE_RE = /ref|cho/i;

function styleVars(settings, { columns, typeScale, scale }) {
  const lyricPx = settings.lyricsSize * typeScale * scale;
  const chordPx = settings.chordsSize * typeScale * scale;
  const headingPx = settings.headingSize * typeScale * scale;
  return {
    '--sheet-columns': String(columns),
    '--lyric-font': `${lyricPx}px`,
    '--chord-font': `${chordPx}px`,
    '--heading-font': `${headingPx}px`,
    '--label-font': `${lyricPx * 0.7}px`,
    '--chord-row-h': `${chordPx * 1.12}px`,
    '--lyric-row-h': `${lyricPx * settings.lineHeight}px`,
    '--header-h': `${lyricPx * 1.76}px`,
    '--font-body': FONT_STACKS[settings.fontFamily]?.stack ?? FONT_STACKS.inter.stack,
    '--heading-color': settings.headingColor,
    '--lyrics-color': settings.lyricsColor,
    '--chords-color': settings.chordsColor,
    '--section-rule': KYTARIO_PALETTE.rule,
    '--badge-bg': KYTARIO_PALETTE.badge,
  };
}

/**
 * Kytario never wraps a lyric line. Very long lines are scaled down instead,
 * so the chords stay glued to the word they belong to.
 */
function useLineScale(enabled) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const available = el.clientWidth;
    if (!available) return;
    const needed = el.scrollWidth;
    const next = needed > available + 0.75
      ? String(Math.max(0.34, available / needed))
      : '1';
    // Only touch the DOM when the value changes; this keeps the measurement
    // pass over a 500-song book from thrashing layout.
    if (el.style.getPropertyValue('--line-scale') !== next) {
      el.style.setProperty('--line-scale', next);
    }
  });
  return ref;
}

function SongHeader({ song, index, settings }) {
  const author = song.author || null;
  const capo = settings.showMetadata && song.capo > 0 ? `(capo ${song.capo})` : null;
  return (
    <header className="song-header" data-song-header>
      <span className="song-number" aria-hidden="true">{index + 1}</span>
      <h1 className="song-title">
        {author ? `${song.name} - ${author}` : song.name}
        {capo && <span className="song-capo">{capo}</span>}
      </h1>
    </header>
  );
}

function SongInterpreter({ song }) {
  return (
    <div className="song-interpreter" data-song-interpreter>
      As performed by {song.interpreter}
    </div>
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

function ChordLine({ line, showChords, scaleLines }) {
  const ref = useLineScale(scaleLines);
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

function InlineLine({ line, scaleLines }) {
  const ref = useLineScale(scaleLines);
  return (
    <div className="song-line inline-line" ref={ref}>
      {line.items.map((item, index) => <InlineItem item={item} key={index} />)}
    </div>
  );
}

function SongSection({ section, settings, hideExpandableChords, scaleLines }) {
  const hideChords = section.expandable && hideExpandableChords;
  const showLabel = settings.showSectionLabels && Boolean(section.title);
  const visibleChords = section.hasChords && !hideChords;
  const chorus = CHORUS_TITLE_RE.test(section.title);
  const className = [
    'song-section',
    section.unnamed ? 'is-instrumental' : '',
    chorus ? 'is-chorus' : '',
    section.hasChords ? 'has-chords' : '',
    showLabel ? 'has-label' : 'no-label',
  ].filter(Boolean).join(' ');

  return (
    <section className={className} data-section data-has-chords={section.hasChords ? 'true' : 'false'}>
      {showLabel && (
        <span className="section-label" aria-hidden="true">
          {visibleChords && <span className="section-label-spacer" />}
          <span className="section-label-text">{section.title}</span>
        </span>
      )}
      <div className="section-lines">
        {section.lines.map((line, index) => (
          line.kind === 'inline'
            ? <InlineLine line={line} scaleLines={scaleLines} key={index} />
            : <ChordLine line={line} showChords={!hideChords} scaleLines={scaleLines} key={index} />
        ))}
      </div>
    </section>
  );
}

function SongSheet({
  song, index, settings, columns, typeScale, scale, measurement = false, style, overflow = false,
}) {
  const showInterpreter = settings.showMetadata
    && song.interpreter
    && song.interpreter !== song.author;
  return (
    <div
      className={`song-sheet${measurement ? ' measure-sheet' : ''}`}
      data-columns={columns}
      data-overflow={overflow ? 'true' : undefined}
      data-measure-song={measurement ? 'true' : undefined}
      data-song-index={measurement ? index : undefined}
      style={{ ...styleVars(settings, { columns, typeScale, scale }), ...style }}
    >
      <SongHeader song={song} index={index} settings={settings} />
      {showInterpreter && <SongInterpreter song={song} />}
      {song.sections.map((section, sectionIndex) => (
        <SongSection
          section={section}
          settings={settings}
          hideExpandableChords={columns === 2}
          scaleLines={!measurement}
          key={sectionIndex}
        />
      ))}
    </div>
  );
}

export function SongPageContent({ page, settings, geometry }) {
  const columns = getColumnCount(settings, geometry);
  const typeScale = getTypeScale(geometry, columns);
  return (
    <SongSheet
      song={page.song}
      index={page.songIndex}
      settings={settings}
      columns={columns}
      typeScale={typeScale}
      scale={page.fit?.scale ?? 1}
      overflow={Boolean(page.fit?.overflow)}
    />
  );
}

/**
 * Hidden copy used to measure each song at scale 1. It uses the exact same
 * component tree, so the measured section heights match the printed page.
 */
export function SongMeasureBlock({ song, index, settings, geometry, columns, typeScale }) {
  return (
    <SongSheet
      song={song}
      index={index}
      settings={settings}
      columns={columns}
      typeScale={typeScale}
      scale={1}
      measurement
      style={{ height: `${geometry.contentHeightPx}px` }}
    />
  );
}
