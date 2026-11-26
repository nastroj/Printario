import { useState } from 'react';
import {
  Download, FileText, LayoutList, Palette, RotateCcw, Settings2, Type, X,
} from 'lucide-react';
import {
  COLOR_PRESETS, KYTARIO_PALETTE, PAPER_SIZES, PAPER_TINTS,
  getColumnCount, getGeometry, getTypeScale,
} from '../lib/settings.js';
import { PAPER_SWATCHES } from '../lib/color.js';
import {
  ColorControl, ColorSwatchButton, PanelSection, Segmented, SelectControl,
  StepperControl, Toggle,
} from './Controls.jsx';

export function SettingsPanel({
  book, settings, update, setMargin, onReset,
  onClose,
}) {
  const geometry = PAPER_SIZES[settings.paper];
  const layoutGeometry = getGeometry(settings);
  const columns = getColumnCount(settings, layoutGeometry);
  const typeScale = getTypeScale(layoutGeometry, columns);
  const effective = (value) => `${(value * typeScale).toFixed(1)} px`;

  const [sectionsOpen, setSectionsOpen] = useState({
    pageSetup: true,
    typography: true,
    inkPaper: true,
    bookExtras: true,
  });

  const toggleSection = (key) => {
    setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const scrollToSection = (id, key) => {
    setSectionsOpen((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 40);
  };

  return (
    <aside className="settings-panel" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="settings-sheet-head modal-head">
        <div className="modal-head-title">
          <span className="modal-head-icon" aria-hidden="true"><Settings2 size={16} /></span>
          <h2>Settings</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings">
          <X size={18} />
        </button>
      </div>
      <div className="settings-scroll">

        <div id="section-page-setup">
          <PanelSection
            icon={FileText}
            title="Page setup"
            open={sectionsOpen.pageSetup}
            onToggle={() => toggleSection('pageSetup')}
          >
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

            <div className="toggle-stack spaced">
              <Toggle
                label="Book mode"
                hint="Mirror inner and outer margins and alternate song number badges left/right on facing pages."
                checked={Boolean(settings.bookMode)}
                onChange={(v) => update('bookMode', v)}
              />
            </div>

            <span className="control-label spaced">
              <span>Margins</span>
              <span className="control-value">
                {Number(layoutGeometry.contentWidthMm.toFixed(1))} × {Number(layoutGeometry.contentHeightMm.toFixed(1))} mm
              </span>
            </span>
            <div className="margin-grid">
              {[
                ['top', 'Top'],
                ['right', settings.bookMode ? 'Outer' : 'Right'],
                ['bottom', 'Bottom'],
                ['left', settings.bookMode ? 'Inner' : 'Left'],
              ].map(([side, label]) => (
                <StepperControl
                  key={side}
                  label={label}
                  hint="mm"
                  value={settings.margins[side]}
                  min={0}
                  max={38}
                  step={1}
                  onChange={(value) => setMargin(side, value)}
                />
              ))}
            </div>
            <p className="control-note">
              In the print dialog: <strong>Margins → None</strong>, browser headers off.
            </p>

          </PanelSection>
        </div>

        <div id="section-typography">
          <PanelSection
            icon={Type}
            title="Typography"
            open={sectionsOpen.typography}
            onToggle={() => toggleSection('typography')}
          >
            <div className="stepper-stack">
              <StepperControl
                label="Song title"
                value={settings.headingSize}
                min={9}
                max={26}
                step={0.5}
                hint={`${effective(settings.headingSize)} on page`}
                onChange={(v) => update('headingSize', v)}
              />
              <StepperControl
                label="Lyrics"
                value={settings.lyricsSize}
                min={8}
                max={20}
                step={0.25}
                hint={`${effective(settings.lyricsSize)} on page`}
                onChange={(v) => update('lyricsSize', v)}
              />
              <StepperControl
                label="Chords"
                value={settings.chordsSize}
                min={8}
                max={20}
                step={0.25}
                hint={`${effective(settings.chordsSize)} on page`}
                onChange={(v) => update('chordsSize', v)}
              />
              <StepperControl
                label="Line height"
                value={settings.lineHeight}
                min={0.9}
                max={1.8}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(v) => update('lineHeight', v)}
              />
            </div>
            <p className="control-note">
              Sizes scale with the column width, so A4, A5 and Letter keep Kytario’s line lengths.
            </p>
          </PanelSection>
        </div>

        <div id="section-ink-paper">
          <PanelSection
            icon={Palette}
            title="Ink & paper"
            open={sectionsOpen.inkPaper}
            onToggle={() => toggleSection('inkPaper')}
          >
            <div className="paper-tint-bar">
              <span className="control-label">
                <span>Paper tint</span>
                <span className="control-value">{String(settings.paperTint || '#ffffff').toUpperCase()}</span>
              </span>
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
                <span className="tint-divider" aria-hidden="true" />
                <ColorSwatchButton
                  id="paper-tint-custom"
                  value={settings.paperTint}
                  defaultColor={KYTARIO_PALETTE.paper}
                  pickerTitle="Paper tint"
                  title="Pick custom paper tint"
                  swatches={PAPER_SWATCHES}
                  size="sm"
                  onChange={(v) => update('paperTint', v)}
                />
              </div>
            </div>

            <span className="control-label spaced"><span>Theme presets</span></span>
            <div className="theme-presets">
              {COLOR_PRESETS.map((preset) => {
                const active = settings.headingColor === preset.heading
                  && settings.lyricsColor === preset.lyrics
                  && settings.chordsColor === preset.chords
                  && (settings.ruleColor ?? KYTARIO_PALETTE.rule) === preset.rule
                  && (settings.chorusColor ?? KYTARIO_PALETTE.chorus) === preset.chorus
                  && (settings.badgeColor ?? KYTARIO_PALETTE.badge) === preset.badge;
                return (
                  <button
                    type="button"
                    key={preset.name}
                    className={`theme-preset${active ? ' is-active' : ''}`}
                    onClick={() => {
                      update('headingColor', preset.heading);
                      update('lyricsColor', preset.lyrics);
                      update('chordsColor', preset.chords);
                      update('ruleColor', preset.rule);
                      update('chorusColor', preset.chorus);
                      update('badgeColor', preset.badge);
                    }}
                    title={preset.name}
                    aria-pressed={active}
                  >
                    <span className="theme-dot" style={{ background: preset.heading }} />
                    <span className="theme-dot" style={{ background: preset.lyrics }} />
                    <span className="theme-dot" style={{ background: preset.chords }} />
                    <span>{preset.name}</span>
                  </button>
                );
              })}
            </div>

            <span className="control-label spaced"><span>Songbook colors</span></span>
            <div className="color-cards-grid">
              <ColorControl
                label="Headings"
                value={settings.headingColor}
                defaultColor={KYTARIO_PALETTE.heading}
                hint="Song titles and artist names"
                onChange={(v) => update('headingColor', v)}
              />
              <ColorControl
                label="Lyrics"
                value={settings.lyricsColor}
                defaultColor={KYTARIO_PALETTE.lyrics}
                hint="Song lyrics and section labels"
                onChange={(v) => update('lyricsColor', v)}
              />
              <ColorControl
                label="Chords"
                value={settings.chordsColor}
                defaultColor={KYTARIO_PALETTE.chords}
                hint="Chord diagrams and inline chords"
                onChange={(v) => update('chordsColor', v)}
              />
              <ColorControl
                label="Number badge"
                value={settings.badgeColor ?? KYTARIO_PALETTE.badge}
                defaultColor={KYTARIO_PALETTE.badge}
                hint="Song number box background"
                onChange={(v) => update('badgeColor', v)}
              />
              <ColorControl
                label="Verse line"
                value={settings.ruleColor ?? KYTARIO_PALETTE.rule}
                defaultColor={KYTARIO_PALETTE.rule}
                hint="Vertical line along verses"
                onChange={(v) => update('ruleColor', v)}
              />
              <ColorControl
                label="Chorus line"
                value={settings.chorusColor ?? KYTARIO_PALETTE.chorus}
                defaultColor={KYTARIO_PALETTE.chorus}
                hint="Vertical line along choruses"
                onChange={(v) => update('chorusColor', v)}
              />
            </div>
          </PanelSection>
        </div>

        <div id="section-book-extras">
          <PanelSection
            icon={LayoutList}
            title="Book extras"
            open={sectionsOpen.bookExtras}
            onToggle={() => toggleSection('bookExtras')}
          >
            <div className="toggle-stack">
              <Toggle label="Cover page" hint="A title page with the book name and songbook link." checked={settings.cover} onChange={(v) => update('cover', v)} />
              <Toggle label="Table of contents" hint="A three-column song list before the songs." checked={settings.contents} onChange={(v) => update('contents', v)} />
              <Toggle label="Song details" hint="Song key beside the title." checked={settings.showMetadata} onChange={(v) => update('showMetadata', v)} />
              <Toggle label="Section lines" hint="Vertical line beside each verse and chorus." checked={settings.showSectionLines !== false} onChange={(v) => update('showSectionLines', v)} />
              <Toggle label="Section labels" hint="Verse and chorus names beside the first line." checked={settings.showSectionLabels} onChange={(v) => update('showSectionLabels', v)} />
            </div>
            <span className="control-label spaced"><span>Section label position</span></span>
            <Segmented
              value={settings.sectionLabelPosition ?? 'after'}
              columns={2}
              ariaLabel="Section label position"
              onChange={(value) => update('sectionLabelPosition', value)}
              options={[
                { value: 'before', label: 'Before line', hint: 'On the left of section lines' },
                { value: 'after', label: 'After line', hint: 'On the right of section lines' },
              ]}
            />
            <SelectControl
              label="Table of contents order"
              value={settings.songOrder}
              onChange={(v) => update('songOrder', v)}
              options={[
                { value: 'manual', label: 'Songbook order' },
                { value: 'title', label: 'Title A → Z' },
                { value: 'author', label: 'Author A → Z' },
              ]}
            />
          </PanelSection>
        </div>

        <div className="panel-footer">
          <button type="button" className="btn btn-ghost btn-danger-text" onClick={onReset}>
            <RotateCcw size={15} /> <span>Reset all settings</span>
          </button>
          <span className="panel-version">Printario · v1.0</span>
        </div>
      </div>
      <nav className="settings-jump" aria-label="Jump to section">
        {[
          ['section-page-setup', 'pageSetup', FileText, 'Page setup'],
          ['section-typography', 'typography', Type, 'Typography'],
          ['section-ink-paper', 'inkPaper', Palette, 'Ink & paper'],
          ['section-book-extras', 'bookExtras', LayoutList, 'Book extras'],
        ].map(([id, key, Icon, label]) => (
          <button
            type="button"
            key={id}
            className="settings-jump-btn"
            onClick={() => scrollToSection(id, key)}
            aria-label={`Jump to ${label}`}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
