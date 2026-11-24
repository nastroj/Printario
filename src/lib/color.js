const RECENT_COLORS_KEY = 'printario.recentColors.v1';
const MAX_RECENT_COLORS = 8;

export const PRINT_SWATCHES = [
  { hex: '#000000', name: 'Pure Black' },
  { hex: '#1c1917', name: 'Stone Ink' },
  { hex: '#27272a', name: 'Charcoal' },
  { hex: '#57534e', name: 'Warm Slate' },
  { hex: '#71717a', name: 'Muted Gray' },
  { hex: '#a1a1aa', name: 'Silver Gray' },
  { hex: '#d4d4d8', name: 'Light Gray' },
  { hex: '#e4e4e7', name: 'Hairline Gray' },
  { hex: '#1e40af', name: 'Print Blue' },
  { hex: '#2563eb', name: 'Kytario Blue' },
  { hex: '#0284c7', name: 'Cerulean' },
  { hex: '#0f766e', name: 'Deep Teal' },
  { hex: '#059669', name: 'Forest Green' },
  { hex: '#c85636', name: 'Studio Clay' },
  { hex: '#d97706', name: 'Warm Amber' },
  { hex: '#b40b24', name: 'Kytario Red' },
];

export const PAPER_SWATCHES = [
  { hex: '#ffffff', name: 'Crisp White' },
  { hex: '#fffdf8', name: 'Studio White' },
  { hex: '#fbf7ee', name: 'Warm Paper' },
  { hex: '#f7f1e3', name: 'Ivory' },
  { hex: '#f3ede2', name: 'Parchment' },
  { hex: '#f5f2eb', name: 'Soft Linen' },
  { hex: '#f9fbfc', name: 'Cool Mist' },
  { hex: '#f3f6f4', name: 'Pale Sage' },
];

export function clampNum(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeHex(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed.split('').map((ch) => ch + ch).join('').toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed.toLowerCase()}`;
  }
  return null;
}

export function hexToRgb(hex) {
  const clean = (normalizeHex(hex) ?? '#000000').slice(1);
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

export function rgbToHex(r, g, b) {
  const toHex = (n) => clampNum(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsv(r, g, b) {
  const rn = clampNum(r, 0, 255) / 255;
  const gn = clampNum(g, 0, 255) / 255;
  const bn = clampNum(b, 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : (delta / max) * 100;
  const v = max * 100;
  return {
    h: Math.round(h) % 360,
    s: Math.round(s),
    v: Math.round(v),
  };
}

export function hsvToRgb(h, s, v) {
  const hue = ((h % 360) + 360) % 360;
  const sat = clampNum(s, 0, 100) / 100;
  const val = clampNum(v, 0, 100) / 100;
  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;

  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hue < 60) {
    rp = c;
    gp = x;
  } else if (hue < 120) {
    rp = x;
    gp = c;
  } else if (hue < 180) {
    gp = c;
    bp = x;
  } else if (hue < 240) {
    gp = x;
    bp = c;
  } else if (hue < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }

  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

export function hsvToHex(h, s, v) {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

export function hexToHsv(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsv(r, g, b);
}

export function contrastInk(hex) {
  const { r, g, b } = hexToRgb(hex);
  const linearize = (channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
  return luminance > 0.36 ? '#18181b' : '#ffffff';
}

export function loadRecentColors() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_COLORS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (typeof item === 'string' ? normalizeHex(item) : null))
      .filter(Boolean)
      .slice(0, MAX_RECENT_COLORS);
  } catch {
    return [];
  }
}

export function pushRecentColor(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return loadRecentColors();
  const next = [normalized, ...loadRecentColors().filter((item) => item !== normalized)].slice(0, MAX_RECENT_COLORS);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(next));
    } catch {
      // Storage can be unavailable in private browsing mode.
    }
  }
  return next;
}
