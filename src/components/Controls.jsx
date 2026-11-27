import { useEffect, useId, useState } from 'react';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import { normalizeHex } from '../lib/color.js';
import { ColorPickerDialog } from './ColorPickerDialog.jsx';

export function PanelSection({ icon: Icon, title, hint, children, defaultOpen = true, open: controlledOpen, onToggle }) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const toggle = onToggle ?? (() => setInternalOpen((v) => !v));
  return (
    <section className={`panel-section${open ? ' is-open' : ''}`}>
      <button type="button" className="panel-section-head" onClick={toggle} aria-expanded={open}>
        <span className="panel-section-icon">{Icon && <Icon size={15} />}</span>
        <span className="panel-section-title">{title}</span>
        <ChevronDown size={15} className="panel-chevron" />
      </button>
      {open && (
        <div className="panel-section-body">
          {hint && <p className="panel-hint">{hint}</p>}
          {children}
        </div>
      )}
    </section>
  );
}

export function Segmented({ value, options, onChange, columns = 2, ariaLabel }) {
  return (
    <div className={`segmented segmented-${columns}`} role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segment${value === option.value ? ' is-active' : ''}`}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          title={option.hint}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function roundToStep(value, step) {
  const stepText = String(step);
  const decimals = stepText.includes('.') ? stepText.split('.')[1].length : 0;
  return Number(value.toFixed(decimals));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function StepperControl({
  label, value, min, max, step = 1, hint, format, onChange,
}) {
  const stepText = String(step);
  const maxDecimals = stepText.includes('.') ? Math.max(2, stepText.split('.')[1].length) : 0;
  const formatDisplay = (num) => (format ? format(num) : String(roundToStep(num, step)));
  const [draft, setDraft] = useState(() => formatDisplay(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(formatDisplay(value));
  }, [value, focused]);

  const stepBy = (delta) => {
    const next = clamp(roundToStep(value + delta, step), min, max);
    onChange(next);
    setDraft(formatDisplay(next));
  };

  const commitDraft = (raw) => {
    const normalized = String(raw).replace(',', '.').trim();
    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed)) {
      setDraft(formatDisplay(value));
      return;
    }
    const next = clamp(Number(parsed.toFixed(maxDecimals)), min, max);
    onChange(next);
    setDraft(formatDisplay(next));
  };

  return (
    <div className="stepper-control">
      <div className="stepper-meta">
        <span className="stepper-label">{label}</span>
        {hint && <span className="stepper-hint">{hint}</span>}
      </div>
      <div className="stepper-box">
        <button
          type="button"
          className="stepper-btn"
          onClick={() => stepBy(-step)}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
        >
          <Minus size={14} />
        </button>
        <input
          type="number"
          inputMode={maxDecimals === 0 ? 'numeric' : 'decimal'}
          className="stepper-input"
          min={min}
          max={max}
          step={step}
          value={draft}
          aria-label={label}
          onFocus={(event) => {
            setFocused(true);
            event.target.select();
          }}
          onChange={(event) => {
            const raw = event.target.value;
            setDraft(raw);
            const parsed = Number.parseFloat(raw.replace(',', '.'));
            if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
              onChange(Number(parsed.toFixed(maxDecimals)));
            }
          }}
          onBlur={() => {
            setFocused(false);
            commitDraft(draft);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              stepBy(step);
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              stepBy(-step);
            }
          }}
        />
        <button
          type="button"
          className="stepper-btn"
          onClick={() => stepBy(step)}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

export function RangeControl({ label, value, min, max, step = 1, unit = '', onChange, format }) {
  const display = format ? format(value) : `${value}${unit}`;
  return (
    <label className="range-control">
      <span className="control-label">
        <span>{label}</span>
        <span className="control-value">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ '--range-progress': `${((value - min) / (max - min)) * 100}%` }}
      />
    </label>
  );
}

export function Toggle({ label, hint, checked, onChange }) {
  return (
    <div
      className="toggle-row"
      role="button"
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onChange(!checked);
        }
      }}
    >
      <span className="toggle-text">
        <span className="toggle-label">{label}</span>
        {hint && <span className="toggle-hint">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`toggle${checked ? ' is-on' : ''}`}
        onClick={(event) => {
          event.stopPropagation();
          onChange(!checked);
        }}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );
}

export function ColorSwatchButton({
  id,
  value,
  defaultColor,
  pickerTitle,
  title = 'Change color',
  swatches,
  size = 'md',
  onChange,
  open: controlledOpen,
  onOpenChange,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const hexLabel = (normalizeHex(value) ?? value ?? '#000000').toUpperCase();

  return (
    <>
      <button
        type="button"
        id={id}
        className={`color-swatch-btn is-${size}`}
        style={{ backgroundColor: value }}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        title={`${title} (${hexLabel})`}
        aria-label={`${pickerTitle || title}: ${hexLabel}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      />
      <ColorPickerDialog
        isOpen={isOpen}
        title={pickerTitle || title}
        value={value}
        defaultColor={defaultColor}
        swatches={swatches}
        onConfirm={(nextHex) => {
          setOpen(false);
          if (nextHex !== value) onChange(nextHex);
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

export function ColorControl({
  label,
  value,
  defaultColor,
  hint,
  swatches,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const buttonId = useId();
  const hexLabel = (normalizeHex(value) ?? value ?? '#000000').toUpperCase();

  return (
    <div
      className="color-card"
      role="button"
      tabIndex={0}
      onClick={() => setOpen(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setOpen(true);
        }
      }}
      title={hint || `${label} (${hexLabel})`}
    >
      <div className="color-card-text">
        <label
          htmlFor={buttonId}
          className="color-card-label"
          onClick={(event) => event.stopPropagation()}
        >
          {label}
        </label>
        <span className="color-card-hex">{hexLabel}</span>
      </div>
      <ColorSwatchButton
        id={buttonId}
        value={value}
        defaultColor={defaultColor}
        pickerTitle={label}
        title={hint || `Change ${label.toLowerCase()} color`}
        swatches={swatches}
        onChange={onChange}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}

export function SelectControl({ label, hint, value, onChange, options, ariaLabel }) {
  return (
    <label className="select-control">
      <span className="control-label">
        <span>{label}</span>
        {hint && <span className="control-value">{hint}</span>}
      </span>
      <select value={value} aria-label={ariaLabel || label} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
