export const PAPER_SIZES = {
  A4: { label: 'A4', width: 210, height: 297, hint: '210 × 297 mm' },
  A5: { label: 'A5', width: 148, height: 210, hint: '148 × 210 mm' },
  Letter: { label: 'Letter', width: 215.9, height: 279.4, hint: '8.5 × 11 in' },
  B5: { label: 'B5', width: 176, height: 250, hint: '176 × 250 mm' },
};

export const FONT_STACKS = {
  inter: {
    label: 'Sans',
    sample: 'Ag',
    stack: '"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  lora: {
    label: 'Serif',
    sample: 'Ag',
    stack: '"Lora Variable", Lora, Georgia, "Times New Roman", serif',
  },
  mono: {
    label: 'Mono',
    sample: 'Ag',
    stack: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
  },
};

export const COLOR_PRESETS = [
  { name: 'Ink & clay', heading: '#1f2a24', lyrics: '#2b2a26', chords: '#b0472e' },
  { name: 'Forest', heading: '#26382e', lyrics: '#2d352e', chords: '#55745b' },
  { name: 'Midnight', heading: '#1c2733', lyrics: '#28313b', chords: '#316b8c' },
  { name: 'Plum', heading: '#33242d', lyrics: '#342c30', chords: '#8a3d5c' },
  { name: 'Sepia', heading: '#3d2f20', lyrics: '#453b2d', chords: '#9a6128' },
  { name: 'Graphite', heading: '#232323', lyrics: '#333333', chords: '#666666' },
];

export const PAPER_TINTS = [
  { name: 'White', value: '#fffefa' },
  { name: 'Warm', value: '#fbf7ee' },
  { name: 'Ivory', value: '#f7f1e3' },
  { name: 'Cool', value: '#f9fbfc' },
];

export const MARGIN_PRESETS = {
  narrow: { top: 10, right: 10, bottom: 12, left: 10 },
  classic: { top: 16, right: 16, bottom: 18, left: 16 },
  roomy: { top: 22, right: 22, bottom: 24, left: 22 },
};

export const DEFAULT_SETTINGS = {
  paper: 'A4',
  orientation: 'portrait',
  margins: { ...MARGIN_PRESETS.classic },
  fontFamily: 'inter',
  headingSize: 31,
  lyricsSize: 13.25,
  chordsSize: 9.25,
  lineHeight: 1.46,
  headingColor: '#1f2a24',
  lyricsColor: '#2b2a26',
  chordsColor: '#b0472e',
  paperTint: '#fffefa',
  cover: true,
  contents: true,
  pageNumbers: true,
  showMetadata: true,
  showSectionLabels: true,
  autoFit: true,
  autoFitStrength: 45,
  autoFitFill: 87,
  songOrder: 'original',
};

const SETTINGS_KEY = 'printario.settings.v1';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const saved = JSON.parse(raw);
    const merged = {
      ...DEFAULT_SETTINGS,
      ...saved,
      margins: { ...DEFAULT_SETTINGS.margins, ...(saved?.margins ?? {}) },
    };
    if (!PAPER_SIZES[merged.paper]) merged.paper = DEFAULT_SETTINGS.paper;
    if (!['portrait', 'landscape'].includes(merged.orientation)) merged.orientation = 'portrait';
    if (!FONT_STACKS[merged.fontFamily]) merged.fontFamily = 'inter';
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable in private mode; the studio still works.
  }
}

export function getGeometry(settings) {
  const paper = PAPER_SIZES[settings.paper] ?? PAPER_SIZES.A4;
  const landscape = settings.orientation === 'landscape';
  const width = landscape ? paper.height : paper.width;
  const height = landscape ? paper.width : paper.height;
  const m = settings.margins;
  const pxPerMm = 96 / 25.4;
  return {
    paper,
    landscape,
    widthMm: width,
    heightMm: height,
    widthPx: width * pxPerMm,
    heightPx: height * pxPerMm,
    marginTop: m.top,
    marginRight: m.right,
    marginBottom: m.bottom,
    marginLeft: m.left,
    contentWidthMm: Math.max(20, width - m.left - m.right),
    contentHeightMm: Math.max(20, height - m.top - m.bottom),
    contentWidthPx: Math.max(40, (width - m.left - m.right) * pxPerMm),
    contentHeightPx: Math.max(40, (height - m.top - m.bottom) * pxPerMm),
    pxPerMm,
  };
}

export function sortSongs(songs, order) {
  if (order === 'title') {
    return [...songs].sort((a, b) => a.name.localeCompare(b.name, 'cs', { sensitivity: 'base' }));
  }
  if (order === 'author') {
    return [...songs].sort((a, b) => {
      const aa = a.author || a.interpreter || 'zzz';
      const bb = b.author || b.interpreter || 'zzz';
      return aa.localeCompare(bb, 'cs', { sensitivity: 'base' }) || a.name.localeCompare(b.name, 'cs');
    });
  }
  return songs;
}
