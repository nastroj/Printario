import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Check, Download, FileText, Printer, Scissors, X,
} from 'lucide-react';
import {
  CROP_MARK_STYLES,
  PRESS_SHEET_SIZES,
  buildSheetSequence,
  computeSheetLayout,
  normalizePdfExportOptions,
} from '../lib/imposition.js';
import { Segmented, SelectControl, StepperControl } from './Controls.jsx';

function SheetPreview({
  geometry, pdfOpts, layout, firstSheetSlots, paperTint,
}) {
  const {
    sheetWidthMm, sheetHeightMm, slots, cols, rows, gapMm, bleedMm, marginXMm, marginYMm,
  } = layout;
  const pad = 10;
  const vbW = sheetWidthMm + pad * 2;
  const vbH = sheetHeightMm + pad * 2;
  const offsetMm = bleedMm > 0 ? bleedMm + 1.5 : 2.5;
  const maxMarkLen = 6;
  const isBooklet = pdfOpts.imposition === 'booklet';
  const fillTint = paperTint && paperTint.toLowerCase() !== '#ffffff' ? paperTint : '#fffef9';

  return (
    <div className="sheet-preview-box">
      <svg
        className="sheet-preview-svg"
        viewBox={`0 0 ${vbW} ${vbH}`}
        role="img"
        aria-label={`Sheet preview: ${Math.round(sheetWidthMm)} by ${Math.round(sheetHeightMm)} millimeters`}
      >
        <defs>
          <clipPath id="sheet-clip">
            <rect x={0} y={0} width={sheetWidthMm} height={sheetHeightMm} rx={1.5} />
          </clipPath>
        </defs>
        <g transform={`translate(${pad}, ${pad})`}>
          {/* Sheet shadow + paper */}
          <rect
            x={1.5}
            y={2.5}
            width={sheetWidthMm}
            height={sheetHeightMm}
            rx={2}
            fill="rgba(32, 43, 36, 0.14)"
          />
          <rect
            x={0}
            y={0}
            width={sheetWidthMm}
            height={sheetHeightMm}
            rx={1.5}
            fill="#ffffff"
            stroke="rgba(32, 43, 36, 0.28)"
            strokeWidth={0.8}
          />

          <g clipPath="url(#sheet-clip)">
            {/* Placed pages */}
            {slots.map((slot, idx) => {
              const entry = firstSheetSlots?.[idx];
              const label = entry?.displayNumber != null ? `P.${entry.displayNumber}` : 'Blank';
              const isBlank = entry?.displayNumber == null;
              const leftBleed = slot.col === 0 ? bleedMm : Math.min(bleedMm, gapMm / 2);
              const rightBleed = slot.col === cols - 1 ? bleedMm : Math.min(bleedMm, gapMm / 2);
              const topBleed = slot.row === 0 ? bleedMm : Math.min(bleedMm, gapMm / 2);
              const bottomBleed = slot.row === rows - 1 ? bleedMm : Math.min(bleedMm, gapMm / 2);

              const fontSize = Math.min(slot.widthMm, slot.heightMm) * 0.16;

              return (
                <g key={slot.index}>
                  {bleedMm > 0 && !isBlank && (
                    <rect
                      x={slot.xMm - leftBleed}
                      y={slot.yMm - topBleed}
                      width={slot.widthMm + leftBleed + rightBleed}
                      height={slot.heightMm + topBleed + bottomBleed}
                      fill={fillTint}
                      stroke="rgba(200, 86, 54, 0.45)"
                      strokeWidth={0.6}
                      strokeDasharray="2 1.5"
                    />
                  )}
                  <rect
                    x={slot.xMm}
                    y={slot.yMm}
                    width={slot.widthMm}
                    height={slot.heightMm}
                    fill={isBlank ? 'rgba(32, 43, 36, 0.04)' : fillTint}
                    stroke="rgba(32, 43, 36, 0.32)"
                    strokeWidth={0.7}
                  />
                  {!isBlank && (
                    <g opacity={0.22}>
                      <line
                        x1={slot.xMm + slot.widthMm * 0.16}
                        y1={slot.yMm + slot.heightMm * 0.25}
                        x2={slot.xMm + slot.widthMm * 0.65}
                        y2={slot.yMm + slot.heightMm * 0.25}
                        stroke="#26342d"
                        strokeWidth={1.6}
                      />
                      <line
                        x1={slot.xMm + slot.widthMm * 0.16}
                        y1={slot.yMm + slot.heightMm * 0.35}
                        x2={slot.xMm + slot.widthMm * 0.82}
                        y2={slot.yMm + slot.heightMm * 0.35}
                        stroke="#26342d"
                        strokeWidth={1}
                      />
                    </g>
                  )}
                  <text
                    x={slot.xMm + slot.widthMm / 2}
                    y={slot.yMm + slot.heightMm / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={fontSize}
                    fontWeight="650"
                    fill={isBlank ? 'rgba(32, 43, 36, 0.35)' : '#26342d'}
                  >
                    {label}
                  </text>
                </g>
              );
            })}

            {/* Crop marks */}
            {pdfOpts.cropMarks && slots.map((slot) => {
              const style = pdfOpts.cropMarkStyle ?? 'standard';
              const leftAvail = slot.col === 0 ? slot.xMm : gapMm / 2;
              const rightAvail = slot.col === cols - 1 ? sheetWidthMm - (slot.xMm + slot.widthMm) : gapMm / 2;
              const topAvail = slot.row === 0 ? slot.yMm : gapMm / 2;
              const bottomAvail = slot.row === rows - 1 ? sheetHeightMm - (slot.yMm + slot.heightMm) : gapMm / 2;
              const corners = [
                [slot.xMm, slot.yMm, -1, -1, leftAvail, topAvail],
                [slot.xMm + slot.widthMm, slot.yMm, 1, -1, rightAvail, topAvail],
                [slot.xMm, slot.yMm + slot.heightMm, -1, 1, leftAvail, bottomAvail],
                [slot.xMm + slot.widthMm, slot.yMm + slot.heightMm, 1, 1, rightAvail, bottomAvail],
              ];
              return corners.map(([cx, cy, dx, dy, availX, availY], cIdx) => {
                if (style === 'cross') {
                  const innerX = Math.min(3.5, slot.widthMm * 0.08);
                  const innerY = Math.min(3.5, slot.heightMm * 0.08);
                  const outerX = availX >= 1.5 ? Math.min(offsetMm + maxMarkLen, availX - 0.3) : 0;
                  const outerY = availY >= 1.5 ? Math.min(offsetMm + maxMarkLen, availY - 0.3) : 0;
                  return (
                    <g key={`${slot.index}-${cIdx}`} stroke="#c85636" strokeWidth={1.1}>
                      <line x1={cx - dx * innerX} y1={cy} x2={cx + dx * outerX} y2={cy} />
                      <line x1={cx} y1={cy - dy * innerY} x2={cx} y2={cy + dy * outerY} />
                    </g>
                  );
                }
                if (style === 'double') {
                  const sep = Math.min(3.2, Math.max(2.2, bleedMm || 2.8));
                  const startX = Math.min(offsetMm, availX * 0.35);
                  const endX = Math.min(offsetMm + maxMarkLen, Math.max(2, availX - 0.4));
                  const startY = Math.min(offsetMm, availY * 0.35);
                  const endY = Math.min(offsetMm + maxMarkLen, Math.max(2, availY - 0.4));
                  return (
                    <g key={`${slot.index}-${cIdx}`} stroke="#c85636" strokeWidth={1}>
                      {availX >= 2 && (
                        <>
                          <line x1={cx + dx * startX} y1={cy} x2={cx + dx * endX} y2={cy} />
                          {availY >= sep + 1.5 && (
                            <line x1={cx + dx * startX} y1={cy + dy * sep} x2={cx + dx * endX} y2={cy + dy * sep} />
                          )}
                        </>
                      )}
                      {availY >= 2 && (
                        <>
                          <line x1={cx} y1={cy + dy * startY} x2={cx} y2={cy + dy * endY} />
                          {availX >= sep + 1.5 && (
                            <line x1={cx + dx * sep} y1={cy + dy * startY} x2={cx + dx * sep} y2={cy + dy * endY} />
                          )}
                        </>
                      )}
                    </g>
                  );
                }
                return (
                  <g
                    key={`${slot.index}-${cIdx}`}
                    stroke="#c85636"
                    strokeWidth={1.1}
                    strokeDasharray={style === 'dashed' ? '2 1.4' : undefined}
                  >
                    {availX >= 2 && (
                      <line
                        x1={cx + dx * Math.min(offsetMm, availX * 0.35)}
                        y1={cy}
                        x2={cx + dx * Math.min(offsetMm + maxMarkLen, Math.max(2, availX - 0.4))}
                        y2={cy}
                      />
                    )}
                    {availY >= 2 && (
                      <line
                        x1={cx}
                        y1={cy + dy * Math.min(offsetMm, availY * 0.35)}
                        x2={cx}
                        y2={cy + dy * Math.min(offsetMm + maxMarkLen, Math.max(2, availY - 0.4))}
                      />
                    )}
                  </g>
                );
              });
            })}

            {/* Seam / fold ticks */}
            {(pdfOpts.centerMarks || (pdfOpts.cropMarks && gapMm === 0 && (cols > 1 || rows > 1))) && slots[0] && (
              <g
                stroke={isBooklet ? '#2563eb' : '#c85636'}
                strokeWidth={1.1}
                strokeDasharray={isBooklet ? '2.5 1.8' : undefined}
              >
                {cols > 1 && Array.from({ length: cols - 1 }, (_, i) => {
                  const seamX = marginXMm + i * (slots[0].widthMm + gapMm) + slots[0].widthMm + gapMm / 2;
                  return (
                    <g key={`cx-${i}`}>
                      {marginYMm >= 2 ? (
                        <>
                          <line x1={seamX} y1={Math.max(0.5, marginYMm - 7)} x2={seamX} y2={marginYMm - 1.5} />
                          <line x1={seamX} y1={sheetHeightMm - marginYMm + 1.5} x2={seamX} y2={Math.min(sheetHeightMm - 0.5, sheetHeightMm - marginYMm + 7)} />
                        </>
                      ) : (
                        <>
                          <line x1={seamX} y1={0} x2={seamX} y2={5} />
                          <line x1={seamX} y1={sheetHeightMm - 5} x2={seamX} y2={sheetHeightMm} />
                        </>
                      )}
                    </g>
                  );
                })}
                {rows > 1 && Array.from({ length: rows - 1 }, (_, i) => {
                  const seamY = marginYMm + i * (slots[0].heightMm + gapMm) + slots[0].heightMm + gapMm / 2;
                  return (
                    <g key={`cy-${i}`}>
                      {marginXMm >= 2 ? (
                        <>
                          <line x1={Math.max(0.5, marginXMm - 7)} y1={seamY} x2={marginXMm - 1.5} y2={seamY} />
                          <line x1={sheetWidthMm - marginXMm + 1.5} y1={seamY} x2={Math.min(sheetWidthMm - 0.5, sheetWidthMm - marginXMm + 7)} y2={seamY} />
                        </>
                      ) : (
                        <>
                          <line x1={0} y1={seamY} x2={5} y2={seamY} />
                          <line x1={sheetWidthMm - 5} y1={seamY} x2={sheetWidthMm} y2={seamY} />
                        </>
                      )}
                    </g>
                  );
                })}
              </g>
            )}

            {/* Registration targets */}
            {pdfOpts.registrationMarks && (
              <g stroke="#26342d" strokeWidth={0.85} fill="none">
                {marginYMm >= 6.5 && (
                  <g>
                    <circle cx={cols % 2 === 0 ? sheetWidthMm * 0.25 : sheetWidthMm / 2} cy={Math.max(3.5, marginYMm - 4.2)} r={2} />
                    <line
                      x1={(cols % 2 === 0 ? sheetWidthMm * 0.25 : sheetWidthMm / 2) - 3.4}
                      y1={Math.max(3.5, marginYMm - 4.2)}
                      x2={(cols % 2 === 0 ? sheetWidthMm * 0.25 : sheetWidthMm / 2) + 3.4}
                      y2={Math.max(3.5, marginYMm - 4.2)}
                    />
                    <line
                      x1={cols % 2 === 0 ? sheetWidthMm * 0.25 : sheetWidthMm / 2}
                      y1={Math.max(3.5, marginYMm - 4.2) - 3.4}
                      x2={cols % 2 === 0 ? sheetWidthMm * 0.25 : sheetWidthMm / 2}
                      y2={Math.max(3.5, marginYMm - 4.2) + 3.4}
                    />
                  </g>
                )}
                {marginXMm >= 6.5 && (
                  <>
                    <circle cx={Math.max(3.5, marginXMm - 4.2)} cy={rows % 2 === 0 ? sheetHeightMm * 0.25 : sheetHeightMm / 2} r={2} />
                    <circle cx={sheetWidthMm - Math.max(3.5, marginXMm - 4.2)} cy={rows % 2 === 0 ? sheetHeightMm * 0.25 : sheetHeightMm / 2} r={2} />
                  </>
                )}
              </g>
            )}

            {/* Slug bar preview */}
            {pdfOpts.slugInfo && marginYMm >= 5.5 && (
              <rect
                x={Math.max(4, marginXMm)}
                y={sheetHeightMm - Math.max(2.6, Math.min(4.4, marginYMm / 2)) - 1}
                width={Math.min(110, sheetWidthMm - Math.max(8, marginXMm * 2))}
                height={2}
                rx={1}
                fill="rgba(32, 43, 36, 0.28)"
              />
            )}
          </g>
        </g>
      </svg>
      <div className="sheet-preview-caption">
        <span>
          {PRESS_SHEET_SIZES[pdfOpts.sheetSize]?.label ?? pdfOpts.sheetSize}{' '}
          {layout.orientation === 'landscape' ? 'Landscape' : 'Portrait'} ·{' '}
          {Math.round(sheetWidthMm)} × {Math.round(sheetHeightMm)} mm
        </span>
        <span>
          {layout.cols}×{layout.rows} · {Math.round(layout.scale * 1000) / 10}%
          {layout.rotated ? ' · rotated 90°' : ''}
        </span>
      </div>
    </div>
  );
}

function MarkChip({ label, checked, onChange }) {
  return (
    <button
      type="button"
      className={`mark-chip${checked ? ' is-active' : ''}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span className="mark-chip-check" aria-hidden="true">
        {checked && <Check size={12} strokeWidth={2.8} />}
      </span>
      <span>{label}</span>
    </button>
  );
}

function CropMarkStyleIcon({ styleKey }) {
  return (
    <svg className="crop-style-icon" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="9.5" y="9.5" width="9" height="9" fill="rgba(32, 43, 36, 0.08)" stroke="rgba(32, 43, 36, 0.25)" strokeWidth="1" />
      {styleKey === 'standard' && (
        <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <line x1="2" y1="9.5" x2="6.5" y2="9.5" />
          <line x1="9.5" y1="2" x2="9.5" y2="6.5" />
        </g>
      )}
      {styleKey === 'cross' && (
        <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <line x1="3" y1="9.5" x2="14.5" y2="9.5" />
          <line x1="9.5" y1="3" x2="9.5" y2="14.5" />
        </g>
      )}
      {styleKey === 'double' && (
        <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <line x1="2" y1="9.5" x2="7" y2="9.5" />
          <line x1="2" y1="6.5" x2="7" y2="6.5" />
          <line x1="9.5" y1="2" x2="9.5" y2="7" />
          <line x1="6.5" y1="2" x2="6.5" y2="7" />
        </g>
      )}
      {styleKey === 'dashed' && (
        <g stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 1.8">
          <line x1="1.5" y1="9.5" x2="7.5" y2="9.5" />
          <line x1="9.5" y1="1.5" x2="9.5" y2="7.5" />
        </g>
      )}
    </svg>
  );
}

export function PdfExportDialog({
  isOpen,
  result,
  settings,
  onChangePdfOptions,
  onExport,
  onClose,
}) {
  const backdropPressRef = useRef(false);
  const pdfOpts = useMemo(
    () => normalizePdfExportOptions(settings?.pdfExport),
    [settings?.pdfExport],
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onClose]);

  const geometry = result?.geometry;
  const pageCount = result?.pageCount ?? 0;

  const layout = useMemo(() => {
    if (!geometry || pdfOpts.mode !== 'pro') return null;
    return computeSheetLayout(geometry.widthMm, geometry.heightMm, pdfOpts);
  }, [geometry, pdfOpts]);

  const sheets = useMemo(() => {
    if (!pageCount || pdfOpts.mode !== 'pro') return [];
    return buildSheetSequence(pageCount, pdfOpts);
  }, [pageCount, pdfOpts]);

  if (!isOpen || !result) return null;

  const updateField = (patch) => {
    onChangePdfOptions(normalizePdfExportOptions({ ...pdfOpts, ...patch }));
  };

  const isPro = pdfOpts.mode === 'pro';
  const trimW = Number(geometry.widthMm.toFixed(1));
  const trimH = Number(geometry.heightMm.toFixed(1));
  const pageOrient = geometry.landscape ? 'Landscape' : 'Portrait';

  const dialog = (
    <div
      className="confirm-layer pdf-export-layer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-export-title"
      onPointerDown={(event) => {
        backdropPressRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (backdropPressRef.current && event.target === event.currentTarget) {
          onClose();
        }
        backdropPressRef.current = false;
      }}
    >
      <div className="confirm-backdrop" />
      <div
        className="confirm-dialog pdf-export-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pdf-export-head modal-head">
          <div className="modal-head-title">
            <span className="modal-head-icon" aria-hidden="true">
              <Download size={16} />
            </span>
            <div>
              <span className="settings-sheet-kicker">
                {result.songbook?.name} · {pageCount} pages
              </span>
              <h3 id="pdf-export-title">Export PDF</h3>
            </div>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close export dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="pdf-export-body">
          <Segmented
            value={pdfOpts.mode}
            columns={2}
            ariaLabel="PDF export mode"
            onChange={(value) => updateField({ mode: value })}
            options={[
              { value: 'standard', label: 'Standard PDF', hint: '1 page per PDF page at exact book size' },
              { value: 'pro', label: 'Print shop (Pro)', hint: '2-up / 4-up imposition, booklet & crop marks' },
            ]}
          />

          {!isPro ? (
            <div className="pdf-standard-summary">
              <div className="pdf-standard-row">
                <FileText size={16} />
                <div>
                  <strong>{settings.paper} {pageOrient} ({trimW} × {trimH} mm)</strong>
                  <p>
                    {pageCount} vector {pageCount === 1 ? 'page' : 'pages'} at exact trim size with embedded fonts.
                  </p>
                </div>
              </div>
              <p className="control-note">
                Need two A4 pages on A3, folded booklet spreads, bleed, or crop marks? Choose{' '}
                <strong>Print shop (Pro)</strong> above.
              </p>
            </div>
          ) : (
            <>
              {layout && (
                <SheetPreview
                  geometry={geometry}
                  pdfOpts={pdfOpts}
                  layout={layout}
                  firstSheetSlots={sheets[0]}
                  paperTint={settings.paperTint}
                />
              )}

              <div className="pdf-pro-controls">
                <div className="pdf-pro-row">
                  <SelectControl
                    label="Press sheet"
                    value={pdfOpts.sheetSize}
                    onChange={(value) => updateField({ sheetSize: value })}
                    options={Object.entries(PRESS_SHEET_SIZES).map(([key, item]) => ({
                      value: key,
                      label: `${item.label} (${item.hint})`,
                    }))}
                  />
                  <div>
                    <span className="control-label"><span>Sheet orientation</span></span>
                    <Segmented
                      value={pdfOpts.sheetOrientation}
                      columns={3}
                      ariaLabel="Sheet orientation"
                      onChange={(value) => updateField({ sheetOrientation: value })}
                      options={[
                        { value: 'auto', label: 'Auto' },
                        { value: 'portrait', label: 'Port' },
                        { value: 'landscape', label: 'Land' },
                      ]}
                    />
                  </div>
                </div>

                {pdfOpts.sheetSize === 'Custom' && (
                  <div className="pdf-pro-row">
                    <StepperControl
                      label="Sheet width"
                      hint="mm"
                      value={pdfOpts.customWidthMm}
                      min={100}
                      max={1200}
                      step={1}
                      onChange={(value) => updateField({ customWidthMm: value })}
                    />
                    <StepperControl
                      label="Sheet height"
                      hint="mm"
                      value={pdfOpts.customHeightMm}
                      min={100}
                      max={1200}
                      step={1}
                      onChange={(value) => updateField({ customHeightMm: value })}
                    />
                  </div>
                )}

                <div className="pdf-pro-row">
                  <div>
                    <span className="control-label"><span>Pages per sheet</span></span>
                    <Segmented
                      value={String(pdfOpts.pagesPerSheet)}
                      columns={3}
                      ariaLabel="Pages per sheet"
                      onChange={(value) => {
                        const count = Number(value);
                        updateField({
                          pagesPerSheet: count,
                          imposition: count !== 2 && pdfOpts.imposition === 'booklet'
                            ? 'sequential'
                            : pdfOpts.imposition,
                        });
                      }}
                      options={[
                        { value: '1', label: '1-up' },
                        { value: '2', label: '2-up' },
                        { value: '4', label: '4-up' },
                      ]}
                    />
                  </div>
                  <div>
                    <span className="control-label"><span>Scaling</span></span>
                    <Segmented
                      value={pdfOpts.fitMode}
                      columns={2}
                      ariaLabel="Page scaling"
                      onChange={(value) => updateField({ fitMode: value })}
                      options={[
                        { value: 'fit-marks', label: 'Fit + marks', hint: 'Leaves margin around trim edges for crop marks' },
                        { value: 'actual', label: '100% size', hint: 'Keeps exact 1:1 trim dimensions' },
                      ]}
                    />
                  </div>
                </div>

                {pdfOpts.pagesPerSheet > 1 && (
                  <div>
                    <span className="control-label"><span>Imposition order</span></span>
                    <Segmented
                      value={pdfOpts.imposition}
                      columns={3}
                      ariaLabel="Imposition order"
                      onChange={(value) => updateField({
                        imposition: value,
                        pagesPerSheet: value === 'booklet' ? 2 : pdfOpts.pagesPerSheet,
                      })}
                      options={[
                        { value: 'sequential', label: 'Sequential', hint: '1–2, 3–4 (cut sheets)' },
                        { value: 'booklet', label: 'Booklet', hint: 'Saddle-stitch (fold & staple)' },
                        { value: 'copies', label: 'Copies', hint: 'Same page repeated to cut multiple copies' },
                      ]}
                    />
                  </div>
                )}

                <div className="pdf-pro-row">
                  {pdfOpts.pagesPerSheet > 1 ? (
                    <StepperControl
                      label="Page gap"
                      hint="mm"
                      value={pdfOpts.gapMm}
                      min={0}
                      max={30}
                      step={1}
                      onChange={(value) => updateField({ gapMm: value })}
                    />
                  ) : (
                    <div />
                  )}
                  <StepperControl
                    label="Bleed"
                    hint="mm"
                    value={pdfOpts.bleedMm}
                    min={0}
                    max={10}
                    step={1}
                    onChange={(value) => updateField({ bleedMm: value })}
                  />
                </div>

                <div>
                  <span className="control-label"><span>Print marks</span></span>
                  <div className="mark-chip-grid">
                    <MarkChip
                      label="Crop marks"
                      checked={pdfOpts.cropMarks}
                      onChange={(v) => updateField({ cropMarks: v })}
                    />
                    <MarkChip
                      label={pdfOpts.imposition === 'booklet' ? 'Fold marks' : 'Cut marks'}
                      checked={pdfOpts.centerMarks}
                      onChange={(v) => updateField({ centerMarks: v })}
                    />
                    <MarkChip
                      label="Registration"
                      checked={pdfOpts.registrationMarks}
                      onChange={(v) => updateField({ registrationMarks: v })}
                    />
                    <MarkChip
                      label="Sheet info & strip"
                      checked={pdfOpts.slugInfo}
                      onChange={(v) => updateField({ slugInfo: v })}
                    />
                  </div>
                </div>

                {pdfOpts.cropMarks && (
                  <div>
                    <span className="control-label">
                      <span>Crop mark style</span>
                      <span className="control-value">
                        {CROP_MARK_STYLES[pdfOpts.cropMarkStyle]?.label ?? 'Standard lines'}
                      </span>
                    </span>
                    <div className="crop-style-grid" role="group" aria-label="Crop mark style">
                      {Object.entries(CROP_MARK_STYLES).map(([key, item]) => {
                        const active = (pdfOpts.cropMarkStyle ?? 'standard') === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            className={`crop-style-btn${active ? ' is-active' : ''}`}
                            onClick={() => updateField({ cropMarkStyle: key })}
                            aria-pressed={active}
                            title={item.hint}
                          >
                            <CropMarkStyleIcon styleKey={key} />
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {layout?.overflowsSheet && (
                  <p className="pdf-export-warn">
                    At 100% size, the placed pages exceed this sheet. Choose <strong>Fit + marks</strong> or a larger sheet (like SRA3).
                  </p>
                )}
                {!layout?.overflowsSheet && layout?.tightOuterMarks && (pdfOpts.cropMarks || pdfOpts.registrationMarks) && (
                  <p className="pdf-export-note">
                    Pages touch the outer sheet edge at 100% — seam cut ticks will appear at the center cut. Choose{' '}
                    <strong>Fit + marks</strong> or <strong>SRA3 (320 × 450 mm)</strong> for full outer crop margins.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="pdf-export-foot">
          <div className="pdf-export-summary-line">
            {isPro
              ? `${sheets.length} ${sheets.length === 1 ? 'sheet' : 'sheets'} · ${layout ? `${Math.round(layout.sheetWidthMm)} × ${Math.round(layout.sheetHeightMm)} mm` : ''}`
              : `${pageCount} ${pageCount === 1 ? 'page' : 'pages'} · ${trimW} × ${trimH} mm`}
          </div>
          <button
            type="button"
            className="primary-button pdf-download-submit"
            onClick={() => onExport(pdfOpts)}
          >
            <Download size={16} />
            <span>{isPro ? 'Download Press PDF' : 'Download PDF'}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(dialog, document.body) : dialog;
}
