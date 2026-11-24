import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, RotateCcw, X } from 'lucide-react';
import {
  PRINT_SWATCHES,
  clampNum,
  contrastInk,
  hexToHsv,
  hexToRgb,
  hsvToHex,
  loadRecentColors,
  normalizeHex,
  pushRecentColor,
  rgbToHex,
  rgbToHsv,
} from '../lib/color.js';

export function ColorPickerDialog({
  isOpen,
  title,
  value,
  defaultColor,
  swatches = PRINT_SWATCHES,
  onConfirm,
  onCancel,
}) {
  const initialHex = normalizeHex(value) ?? '#18181b';
  const normalizedDefault = defaultColor ? normalizeHex(defaultColor) : null;

  const [hsv, setHsv] = useState(() => hexToHsv(initialHex));
  const [draftHex, setDraftHex] = useState(initialHex);
  const [hexField, setHexField] = useState(initialHex.slice(1).toUpperCase());
  const [mode, setMode] = useState('rgb');
  const [recentColors, setRecentColors] = useState(() => loadRecentColors());
  const [copied, setCopied] = useState(false);
  const [draggingSv, setDraggingSv] = useState(false);
  const [draggingHue, setDraggingHue] = useState(false);

  const svRef = useRef(null);
  const hueRef = useRef(null);
  const wasOpenRef = useRef(false);
  const backdropPressRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const startHex = normalizeHex(value) ?? '#18181b';
      setHsv(hexToHsv(startHex));
      setDraftHex(startHex);
      setHexField(startHex.slice(1).toUpperCase());
      setRecentColors(loadRecentColors());
      setCopied(false);
      backdropPressRef.current = false;
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, value]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onCancel]);

  const applyHsv = useCallback((next) => {
    const clean = {
      h: ((Math.round(next.h) % 360) + 360) % 360,
      s: clampNum(Math.round(next.s), 0, 100),
      v: clampNum(Math.round(next.v), 0, 100),
    };
    const hex = hsvToHex(clean.h, clean.s, clean.v);
    setHsv(clean);
    setDraftHex(hex);
    setHexField(hex.slice(1).toUpperCase());
  }, []);

  const applyHex = useCallback((candidate) => {
    const hex = normalizeHex(candidate);
    if (!hex) return;
    setHsv((prev) => {
      const next = hexToHsv(hex);
      return next.s === 0 ? { h: prev.h, s: 0, v: next.v } : next;
    });
    setDraftHex(hex);
    setHexField(hex.slice(1).toUpperCase());
  }, []);

  const updateSvFromPoint = useCallback((clientX, clientY) => {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const sat = clampNum((clientX - rect.left) / rect.width, 0, 1);
    const val = clampNum((clientY - rect.top) / rect.height, 0, 1);
    setHsv((prev) => {
      const next = { h: prev.h, s: Math.round(sat * 100), v: Math.round((1 - val) * 100) };
      const hex = hsvToHex(next.h, next.s, next.v);
      setDraftHex(hex);
      setHexField(hex.slice(1).toUpperCase());
      return next;
    });
  }, []);

  const updateHueFromPoint = useCallback((clientX) => {
    const el = hueRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = clampNum((clientX - rect.left) / rect.width, 0, 1);
    const nextHue = Math.round(ratio * 359);
    setHsv((prev) => {
      const next = { ...prev, h: nextHue };
      const hex = hsvToHex(next.h, next.s, next.v);
      setDraftHex(hex);
      setHexField(hex.slice(1).toUpperCase());
      return next;
    });
  }, []);

  if (!isOpen || typeof document === 'undefined') return null;

  const rgb = hexToRgb(draftHex);
  const pureHueColor = `hsl(${hsv.h}, 100%, 50%)`;
  const newContrast = contrastInk(draftHex);
  const oldContrast = contrastInk(initialHex);
  const canResetDefault = Boolean(normalizedDefault && normalizedDefault !== draftHex);

  const handleSvPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraggingSv(true);
    updateSvFromPoint(event.clientX, event.clientY);
  };

  const handleSvPointerMove = (event) => {
    if (!draggingSv) return;
    event.preventDefault();
    updateSvFromPoint(event.clientX, event.clientY);
  };

  const handleSvPointerUp = (event) => {
    if (!draggingSv) return;
    setDraggingSv(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleSvKeyDown = (event) => {
    const step = event.shiftKey ? 10 : 2;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      applyHsv({ ...hsv, s: hsv.s - step });
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      applyHsv({ ...hsv, s: hsv.s + step });
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      applyHsv({ ...hsv, v: hsv.v + step });
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      applyHsv({ ...hsv, v: hsv.v - step });
    }
  };

  const handleHuePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraggingHue(true);
    updateHueFromPoint(event.clientX);
  };

  const handleHuePointerMove = (event) => {
    if (!draggingHue) return;
    event.preventDefault();
    updateHueFromPoint(event.clientX);
  };

  const handleHuePointerUp = (event) => {
    if (!draggingHue) return;
    setDraggingHue(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleHueKeyDown = (event) => {
    const step = event.shiftKey ? 15 : 3;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      applyHsv({ ...hsv, h: (hsv.h - step + 360) % 360 });
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      applyHsv({ ...hsv, h: (hsv.h + step) % 360 });
    }
  };

  const handleHexInput = (event) => {
    const cleaned = event.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toUpperCase();
    setHexField(cleaned);
    if (cleaned.length === 6) {
      const normalized = normalizeHex(cleaned);
      if (normalized) {
        setDraftHex(normalized);
        setHsv((prev) => {
          const next = hexToHsv(normalized);
          return next.s === 0 ? { h: prev.h, s: 0, v: next.v } : next;
        });
      }
    }
  };

  const commitHexInput = () => {
    const normalized = normalizeHex(hexField);
    if (normalized) applyHex(normalized);
    else setHexField(draftHex.slice(1).toUpperCase());
  };

  const handleRgbChange = (channel, rawValue) => {
    const digits = rawValue.replace(/\D/g, '');
    const numeric = digits === '' ? 0 : clampNum(Number.parseInt(digits, 10), 0, 255);
    const nextRgb = { ...rgb, [channel]: numeric };
    const nextHex = rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b);
    const nextHsv = rgbToHsv(nextRgb.r, nextRgb.g, nextRgb.b);
    setHsv((prev) => (nextHsv.s === 0 ? { h: prev.h, s: 0, v: nextHsv.v } : nextHsv));
    setDraftHex(nextHex);
    setHexField(nextHex.slice(1).toUpperCase());
  };

  const handleHsvChange = (channel, rawValue) => {
    const digits = rawValue.replace(/\D/g, '');
    const max = channel === 'h' ? 360 : 100;
    const numeric = digits === '' ? 0 : clampNum(Number.parseInt(digits, 10), 0, max);
    applyHsv({ ...hsv, [channel]: channel === 'h' ? numeric % 360 : numeric });
  };

  const handleCopyHex = async () => {
    try {
      await navigator.clipboard?.writeText(draftHex.toUpperCase());
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard API can be unavailable in restricted contexts.
    }
  };

  const handleConfirm = () => {
    const finalHex = normalizeHex(hexField) ?? draftHex;
    pushRecentColor(finalHex);
    onConfirm(finalHex);
  };

  return createPortal(
    <div
      data-color-picker-modal="true"
      className="cp-layer"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
    >
      <div
        className="cp-backdrop"
        aria-hidden="true"
        onPointerDown={(event) => {
          backdropPressRef.current = event.target === event.currentTarget;
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (backdropPressRef.current) {
            backdropPressRef.current = false;
            onCancel();
          }
        }}
      />
      <div
        className="cp-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="color-picker-modal-title"
        onPointerDown={() => {
          backdropPressRef.current = false;
        }}
      >
        <div className="cp-head">
          <div className="cp-title-wrap">
            <h3 id="color-picker-modal-title">{title}</h3>
            <p>Pick a color or enter HEX / RGB / HSV</p>
          </div>
          <button
            type="button"
            className="cp-close"
            onClick={onCancel}
            aria-label="Close color picker"
          >
            <X size={16} />
          </button>
        </div>

        <div
          ref={svRef}
          role="slider"
          tabIndex={0}
          aria-label="Color saturation and brightness"
          aria-valuetext={`Saturation ${hsv.s}%, Brightness ${hsv.v}%`}
          onPointerDown={handleSvPointerDown}
          onPointerMove={handleSvPointerMove}
          onPointerUp={handleSvPointerUp}
          onPointerCancel={handleSvPointerUp}
          onKeyDown={handleSvKeyDown}
          className="cp-sv-canvas"
          style={{ backgroundColor: pureHueColor }}
        >
          <div className="cp-sv-white" />
          <div className="cp-sv-black" />
          <div
            className={`cp-sv-thumb${draggingSv ? ' is-dragging' : ''}`}
            style={{
              left: `${hsv.s}%`,
              top: `${100 - hsv.v}%`,
              backgroundColor: draftHex,
            }}
          />
        </div>

        <div
          ref={hueRef}
          role="slider"
          tabIndex={0}
          aria-label="Hue"
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={hsv.h}
          onPointerDown={handleHuePointerDown}
          onPointerMove={handleHuePointerMove}
          onPointerUp={handleHuePointerUp}
          onPointerCancel={handleHuePointerUp}
          onKeyDown={handleHueKeyDown}
          className="cp-hue-track"
        >
          <div className="cp-hue-gradient" />
          <div
            className={`cp-hue-thumb${draggingHue ? ' is-dragging' : ''}`}
            style={{ left: `${(hsv.h / 359) * 100}%` }}
          >
            <span style={{ backgroundColor: pureHueColor }} />
          </div>
        </div>

        <div className="cp-preview-hex-row">
          <div className="cp-compare-pill">
            <button
              type="button"
              className="cp-compare-half"
              style={{ backgroundColor: initialHex, color: oldContrast }}
              onClick={() => applyHex(initialHex)}
              title={`Original: ${initialHex.toUpperCase()} (tap to revert)`}
            >
              Old
            </button>
            <div
              className="cp-compare-half is-new"
              style={{ backgroundColor: draftHex, color: newContrast }}
              title={`Selected: ${draftHex.toUpperCase()}`}
            >
              New
            </div>
          </div>

          <div className="cp-hex-box">
            <span className="cp-hex-prefix" aria-hidden="true">#</span>
            <input
              type="text"
              className="cp-hex-input"
              value={hexField}
              onChange={handleHexInput}
              onBlur={commitHexInput}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commitHexInput();
                  event.currentTarget.blur();
                }
              }}
              maxLength={6}
              spellCheck={false}
              autoCapitalize="characters"
              aria-label="Hex color code"
            />
            <button
              type="button"
              className="cp-copy-btn"
              onClick={handleCopyHex}
              title={copied ? 'Copied!' : 'Copy HEX code'}
              aria-label="Copy HEX code"
            >
              {copied ? <Check size={14} className="cp-copied-icon" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        <div className="cp-values-card">
          <div className="cp-values-head">
            <span>Color Values</span>
            <div className="cp-mode-tabs" role="tablist" aria-label="Color value format">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'rgb'}
                className={`cp-mode-tab${mode === 'rgb' ? ' is-active' : ''}`}
                onClick={() => setMode('rgb')}
              >
                RGB
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'hsv'}
                className={`cp-mode-tab${mode === 'hsv' ? ' is-active' : ''}`}
                onClick={() => setMode('hsv')}
              >
                HSV
              </button>
            </div>
          </div>

          {mode === 'rgb' ? (
            <div className="cp-channel-grid">
              {[
                { key: 'r', label: 'R', aria: 'Red' },
                { key: 'g', label: 'G', aria: 'Green' },
                { key: 'b', label: 'B', aria: 'Blue' },
              ].map((item) => (
                <label className="cp-channel-field" key={item.key}>
                  <span className="cp-channel-label">{item.label}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={rgb[item.key]}
                    onFocus={(event) => event.target.select()}
                    onChange={(event) => handleRgbChange(item.key, event.target.value)}
                    aria-label={item.aria}
                    className="cp-channel-input"
                  />
                </label>
              ))}
            </div>
          ) : (
            <div className="cp-channel-grid">
              {[
                { key: 'h', label: 'H', suffix: '°', aria: 'Hue' },
                { key: 's', label: 'S', suffix: '%', aria: 'Saturation' },
                { key: 'v', label: 'V', suffix: '%', aria: 'Brightness' },
              ].map((item) => (
                <label className="cp-channel-field" key={item.key}>
                  <span className="cp-channel-label">{item.label}</span>
                  <span className="cp-channel-value-wrap">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={hsv[item.key]}
                      onFocus={(event) => event.target.select()}
                      onChange={(event) => handleHsvChange(item.key, event.target.value)}
                      aria-label={item.aria}
                      className="cp-channel-input"
                    />
                    <span className="cp-channel-suffix">{item.suffix}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="cp-swatches-group">
          <div>
            <span className="cp-group-label">Print Swatches</span>
            <div className="cp-swatch-grid">
              {swatches.map((swatch) => {
                const active = draftHex === swatch.hex;
                return (
                  <button
                    type="button"
                    key={swatch.hex}
                    onClick={() => applyHex(swatch.hex)}
                    title={`${swatch.name} (${swatch.hex.toUpperCase()})`}
                    aria-label={`${swatch.name} ${swatch.hex}`}
                    aria-pressed={active}
                    className={`cp-swatch-tile${active ? ' is-active' : ''}`}
                    style={{ backgroundColor: swatch.hex }}
                  >
                    {active && <Check size={14} style={{ color: contrastInk(swatch.hex) }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {recentColors.length > 0 && (
            <div>
              <span className="cp-group-label">Recent</span>
              <div className="cp-swatch-grid">
                {recentColors.map((hex) => {
                  const active = draftHex === hex;
                  return (
                    <button
                      type="button"
                      key={hex}
                      onClick={() => applyHex(hex)}
                      title={hex.toUpperCase()}
                      aria-label={`Recent color ${hex}`}
                      aria-pressed={active}
                      className={`cp-swatch-tile${active ? ' is-active' : ''}`}
                      style={{ backgroundColor: hex }}
                    >
                      {active && <Check size={14} style={{ color: contrastInk(hex) }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="cp-foot">
          {canResetDefault ? (
            <button
              type="button"
              className="cp-default-btn"
              onClick={() => applyHex(normalizedDefault)}
              title={`Reset to default (${normalizedDefault.toUpperCase()})`}
            >
              <RotateCcw size={14} />
              <span>Default</span>
            </button>
          ) : (
            <div />
          )}
          <div className="cp-actions">
            <button type="button" className="cp-cancel-btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="cp-ok-btn" onClick={handleConfirm}>
              OK
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
