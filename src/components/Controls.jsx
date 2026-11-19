import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export function PanelSection({ icon: Icon, title, hint, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`panel-section${open ? ' is-open' : ''}`}>
      <button type="button" className="panel-section-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
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
    <div className="toggle-row" onClick={() => onChange(!checked)}>
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

export function ColorControl({ label, value, onChange }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = (next) => {
    setDraft(next);
    if (/^#[0-9a-fA-F]{6}$/.test(next)) onChange(next);
  };

  return (
    <div className="color-control">
      <span className="control-label"><span>{label}</span></span>
      <div className="color-input-row">
        <label className="color-swatch" style={{ '--swatch': value }}>
          <input
            type="color"
            value={value}
            onChange={(event) => commit(event.target.value)}
            aria-label={`${label} color picker`}
          />
        </label>
        <input
          className="color-hex"
          value={draft}
          onChange={(event) => commit(event.target.value)}
          spellCheck="false"
          maxLength={7}
          aria-label={`${label} hex color`}
        />
      </div>
    </div>
  );
}

export function SelectControl({ label, value, onChange, options }) {
  return (
    <label className="select-control">
      <span className="control-label"><span>{label}</span></span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
