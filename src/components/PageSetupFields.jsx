import { PAPER_SIZES, getColumnCount, getGeometry } from '../lib/settings.js';
import { Segmented, SelectControl, StepperControl, Toggle } from './Controls.jsx';

export function PageSetupFields({ settings, update, setMargin, showPrintNote = false }) {
  const geometry = PAPER_SIZES[settings.paper];
  const layoutGeometry = getGeometry(settings);
  const columns = getColumnCount(settings, layoutGeometry);

  return (
    <>
      <SelectControl
        label="Paper size"
        hint={settings.paper === 'Custom'
          ? `${layoutGeometry.widthMm} × ${layoutGeometry.heightMm} mm`
          : geometry.hint}
        value={settings.paper}
        ariaLabel="Paper size"
        onChange={(value) => update('paper', value)}
        options={Object.entries(PAPER_SIZES).map(([value, item]) => ({
          value,
          label: value === 'Custom' ? item.label : `${item.label} (${item.hint})`,
        }))}
      />

      {settings.paper === 'Custom' && (
        <div className="margin-grid custom-paper-grid">
          <StepperControl
            label="Width"
            hint="mm"
            value={layoutGeometry.widthMm}
            min={80}
            max={1000}
            step={1}
            onChange={(w) => {
              const h = layoutGeometry.heightMm;
              update({
                customPaperWidth: w,
                orientation: w > h ? 'landscape' : w < h ? 'portrait' : settings.orientation,
              });
            }}
          />
          <StepperControl
            label="Height"
            hint="mm"
            value={layoutGeometry.heightMm}
            min={80}
            max={1000}
            step={1}
            onChange={(h) => {
              const w = layoutGeometry.widthMm;
              update({
                customPaperHeight: h,
                orientation: w > h ? 'landscape' : w < h ? 'portrait' : settings.orientation,
              });
            }}
          />
        </div>
      )}

      <span className="control-label spaced"><span>Orientation</span></span>
      <Segmented
        value={settings.orientation}
        columns={2}
        ariaLabel="Paper orientation"
        onChange={(value) => {
          if (settings.paper === 'Custom') {
            const w = layoutGeometry.widthMm;
            const h = layoutGeometry.heightMm;
            if ((value === 'portrait' && w > h) || (value === 'landscape' && w < h)) {
              update({
                orientation: value,
                customPaperWidth: h,
                customPaperHeight: w,
              });
              return;
            }
          }
          update('orientation', value);
        }}
        options={[
          { value: 'portrait', label: 'Portrait', icon: <span className="orientation-icon portrait" /> },
          { value: 'landscape', label: 'Landscape', icon: <span className="orientation-icon landscape" /> },
        ]}
      />

      <span className="control-label spaced">
        <span>Columns</span>
        <span className="control-value">{columns} {columns === 1 ? 'column' : 'columns'}</span>
      </span>
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

      {showPrintNote && (
        <p className="control-note">
          In the print dialog: <strong>Margins → None</strong>, browser headers off.
        </p>
      )}
    </>
  );
}
