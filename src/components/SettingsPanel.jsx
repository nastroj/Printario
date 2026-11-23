import {
  ArrowUpRight, BookOpen, Check, FileText, LayoutList, ListMusic, Palette,
  Printer, RotateCcw, Type, X,
} from 'lucide-react';
import {
  COLOR_PRESETS, FONT_STACKS, MARGIN_PRESETS, PAPER_SIZES, PAPER_TINTS,
  getColumnCount, getGeometry, getTypeScale,
} from '../lib/settings.js';
import {
  ColorControl, PanelSection, RangeControl, Segmented, SelectControl, Toggle,
} from './Controls.jsx';

function SongbookCard({ book, onResetBook, onOpenContents, onPrint }) {
  return (
    <div className="book-card">
      <div className="book-card-top">
        <span className="book-card-icon"><BookOpen size={19} /></span>
        <div className="book-card-titles">
          <span className="book-card-kicker">Now typesetting</span>
          <h2>{book.name}</h2>
          <p>{book.songs.length} songs{book.projectName ? ` · ${book.projectName}` : ''}</p>
        </div>
      </div>
      <div className="book-card-actions">
        <button type="button" className="soft-button" onClick={onOpenContents}><ListMusic size={15} /> Contents</button>
        <button type="button" className="soft-button" onClick={onResetBook}><RotateCcw size={15} /> Change</button>
      </div>
      <button type="button" className="primary-button wide-button" onClick={onPrint}>
        <Printer size={17} /> Print / Save as PDF
      </button>
      <a className="book-source" href={book.sourceUrl} target="_blank" rel="noreferrer">
        {book.demo ? 'Demo songbook' : 'Open source on Kytario'} <ArrowUpRight size={12} />
      </a>
      <p className="book-print-tip">
        In the print dialog: <strong>Margins → None</strong>, browser headers off.
      </p>
    </div>
  );
}

export function SettingsPanel({
  book, settings, update, setMargin, onReset, onResetBook, onOpenContents, onPrint, isMobile, onClose,
}) {
  const geometry = PAPER_SIZES[settings.paper];
  const layoutGeometry = getGeometry(settings);
  const columns = getColumnCount(settings, layoutGeometry);
  const typeScale = getTypeScale(layoutGeometry, columns);
  const effective = (value) => `${(value * typeScale).toFixed(1)} px`;

  return (
    <aside className={`settings-panel${isMobile ? ' is-mobile' : ''}`}>
      <div className="settings-scroll">
        {isMobile && (
          <div className="mobile-panel-head">
            <span>Print settings</span>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings"><X size={18} /></button>
          </div>
        )}

        <SongbookCard
          book={book}
          onResetBook={onResetBook}
          onOpenContents={onOpenContents}
          onPrint={onPrint}
        />

        <PanelSection icon={FileText} title="Page setup">
          <span className="control-label"><span>Paper size</span><span className="control-value">{geometry.hint}</span></span>
          <Segmented
            value={settings.paper}
            columns={2}
            ariaLabel="Paper size"
            onChange={(value) => update('paper', value)}
            options={Object.entries(PAPER_SIZES).map(([value, item]) => ({ value, label: item.label, hint: item.hint }))}
          />

          <span className="control-label spaced"><span>Orientation</span></span>
          <Segmented
            value={settings.orientation}
            columns={2}
            ariaLabel="Paper orientation"
            onChange={(value) => update('orientation', value)}
            options={[
              { value: 'portrait', label: 'Portrait', icon: <span className="orientation-icon portrait" /> },
              { value: 'landscape', label: 'Landscape', icon: <span className="orientation-icon landscape" /> },
            ]}
          />

          <span className="control-label spaced"><span>Columns</span><span className="control-value">{columns} {columns === 1 ? 'column' : 'columns'}</span></span>
          <Segmented
            value={settings.columns}
            columns={3}
            ariaLabel="Print columns"
            onChange={(value) => update('columns', value)}
            options={[
              { value: 'auto', label: 'Auto', hint: 'Two columns on landscape, one on portrait' },
              { value: 'one', label: '1', hint: 'Single column' },
              { value: 'two', label: '2', hint: 'Two columns, like Kytario print' },
            ]}
          />

          <span className="control-label spaced"><span>Margins</span></span>
          <div className="preset-row">
            {Object.entries(MARGIN_PRESETS).map(([key, preset]) => {
              const active = ['top', 'right', 'bottom', 'left'].every((side) => settings.margins[side] === preset[side]);
              return (
                <button
                  type="button"
                  className={`preset-chip${active ? ' is-active' : ''}`}
                  onClick={() => setMargin(null, preset)}
                  key={key}
                >
                  {key === 'kytario' && <Check size={12} />}
                  {key[0].toUpperCase() + key.slice(1)}
                </button>
              );
            })}
          </div>
          <div className="margin-grid">
            {[
              ['top', 'Top'],
              ['right', 'Right'],
              ['bottom', 'Bottom'],
              ['left', 'Left'],
            ].map(([side, label]) => (
              <RangeControl
                key={side}
                label={label}
                value={settings.margins[side]}
                min={6}
                max={38}
                step={1}
                unit=" mm"
                onChange={(value) => setMargin(side, value)}
              />
            ))}
          </div>

        </PanelSection>

        <PanelSection icon={Type} title="Typography">
          <div className="font-options">
            {Object.entries(FONT_STACKS).map(([key, item]) => (
              <button
                type="button"
                className={`font-option${settings.fontFamily === key ? ' is-active' : ''}`}
                onClick={() => update('fontFamily', key)}
                key={key}
              >
                <span className="font-sample" style={{ fontFamily: item.stack }}>{item.sample}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <RangeControl label="Song title" value={settings.headingSize} min={9} max={26} step={0.5} format={effective} onChange={(v) => update('headingSize', v)} />
          <RangeControl label="Lyrics" value={settings.lyricsSize} min={8} max={20} step={0.25} format={effective} onChange={(v) => update('lyricsSize', v)} />
          <RangeControl label="Chords" value={settings.chordsSize} min={8} max={20} step={0.25} format={effective} onChange={(v) => update('chordsSize', v)} />
          <RangeControl label="Line height" value={settings.lineHeight} min={0.9} max={1.8} step={0.02} onChange={(v) => update('lineHeight', v)} format={(v) => v.toFixed(2)} />
          <p className="control-note">
            Sizes scale with the column width, so A4, A5 and Letter keep Kytario’s line lengths.
          </p>
        </PanelSection>

        <PanelSection icon={Palette} title="Ink & paper">
          <span className="control-label"><span>Paper tint</span></span>
          <div className="tint-row">
            {PAPER_TINTS.map((tint) => (
              <button
                type="button"
                key={tint.value}
                className={`tint-swatch${settings.paperTint === tint.value ? ' is-active' : ''}`}
                style={{ '--tint': tint.value }}
                onClick={() => update('paperTint', tint.value)}
                title={tint.name}
                aria-label={`${tint.name} paper`}
              />
            ))}
          </div>
          <span className="control-label spaced"><span>Theme presets</span></span>
          <div className="theme-presets">
            {COLOR_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.name}
                className="theme-preset"
                onClick={() => {
                  update('headingColor', preset.heading);
                  update('lyricsColor', preset.lyrics);
                  update('chordsColor', preset.chords);
                }}
                title={preset.name}
              >
                <span className="theme-dot" style={{ background: preset.heading }} />
                <span className="theme-dot" style={{ background: preset.lyrics }} />
                <span className="theme-dot" style={{ background: preset.chords }} />
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
          <div className="color-grid">
            <ColorControl label="Headings" value={settings.headingColor} onChange={(v) => update('headingColor', v)} />
            <ColorControl label="Lyrics" value={settings.lyricsColor} onChange={(v) => update('lyricsColor', v)} />
            <ColorControl label="Chords" value={settings.chordsColor} onChange={(v) => update('chordsColor', v)} />
          </div>
        </PanelSection>

        <PanelSection icon={LayoutList} title="Book extras">
          <div className="toggle-stack">
            <Toggle label="Cover page" hint="A title page with the book name and songbook link." checked={settings.cover} onChange={(v) => update('cover', v)} />
            <Toggle label="Table of contents" hint="A three-column song list before the songs." checked={settings.contents} onChange={(v) => update('contents', v)} />
            <Toggle label="Song details" hint="Song key beside the title." checked={settings.showMetadata} onChange={(v) => update('showMetadata', v)} />
            <Toggle label="Section labels" hint="Verse and chorus names in the left gutter." checked={settings.showSectionLabels} onChange={(v) => update('showSectionLabels', v)} />
          </div>
          <SelectControl
            label="Song order"
            value={settings.songOrder}
            onChange={(v) => update('songOrder', v)}
            options={[
              { value: 'manual', label: 'Songbook order' },
              { value: 'title', label: 'Title A → Z' },
              { value: 'author', label: 'Author A → Z' },
            ]}
          />
        </PanelSection>

        <div className="panel-footer">
          <button type="button" className="text-button" onClick={onReset}>
            <RotateCcw size={14} /> Reset all settings
          </button>
          <span className="panel-version">Printario · v1.0</span>
        </div>
      </div>
      <button type="button" className="mobile-print-button primary-button" onClick={onPrint}>
        <Printer size={17} /> Print / Save as PDF
      </button>
    </aside>
  );
}
