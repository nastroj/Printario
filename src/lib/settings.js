export const PAPER_SIZES = {
  A4: { label: 'A4', width: 210, height: 297, hint: '210 × 297 mm' },
  A5: { label: 'A5', width: 148, height: 210, hint: '148 × 210 mm' },
  Letter: { label: 'Letter', width: 215.9, height: 279.4, hint: '8.5 × 11 in' },
  B5: { label: 'B5', width: 176, height: 250, hint: '176 × 250 mm' },
};

export const FONT_STACKS = {
  inter: {
    label: 'Inter',
    sample: 'Ag',
    stack: '"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  lora: {
    label: 'Lora',
    sample: 'Ag',
    stack: '"Lora Variable", Lora, Georgia, "Times New Roman", serif',
  },
  mono: {
    label: 'Mono',
    sample: 'Ag',
    stack: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
  },
};

/**
 * Kytario's print palette. These are the Tailwind colours Kytario itself uses
 * for printed songs, rounded to hex so the colour pickers can round-trip them.
 */
export const KYTARIO_PALETTE = {
  heading: '#111827',
  lyrics: '#1f2937',
  chords: '#1e40af',
  rule: '#9ca3af',
  chorus: '#2563eb',
  badge: '#1f2937',
  paper: '#ffffff',
};

export const COLOR_PRESETS = [
  { name: 'Kytario', heading: KYTARIO_PALETTE.heading, lyrics: KYTARIO_PALETTE.lyrics, chords: KYTARIO_PALETTE.chords },
  { name: 'Ink & clay', heading: '#1f2a24', lyrics: '#2b2a26', chords: '#b0472e' },
  { name: 'Forest', heading: '#26382e', lyrics: '#2d352e', chords: '#55745b' },
  { name: 'Midnight', heading: '#1c2733', lyrics: '#28313b', chords: '#316b8c' },
  { name: 'Plum', heading: '#33242d', lyrics: '#342c30', chords: '#8a3d5c' },
  { name: 'Sepia', heading: '#3d2f20', lyrics: '#453b2d', chords: '#9a6128' },
  { name: 'Graphite', heading: '#232323', lyrics: '#333333', chords: '#666666' },
];

export const PAPER_TINTS = [
  { name: 'White', value: '#ffffff' },
  { name: 'Warm', value: '#fbf7ee' },
  { name: 'Ivory', value: '#f7f1e3' },
  { name: 'Cool', value: '#f9fbfc' },
];

export const MARGIN_PRESETS = {
  kytario: { top: 7, right: 7, bottom: 7, left: 7 },
  classic: { top: 12, right: 12, bottom: 14, left: 12 },
  roomy: { top: 20, right: 20, bottom: 22, left: 20 },
};

export const DEFAULT_MARGINS = { ...MARGIN_PRESETS.kytario };

export const DEFAULT_SETTINGS = {
  paper: 'A4',
  orientation: 'landscape',
  columns: 'auto',
  margins: { ...DEFAULT_MARGINS },
  fontFamily: 'inter',
  // Reference type sizes for an A4 landscape page with 7 mm margins and two
  // columns. They are scaled with the column width so every paper size keeps
  // Kytario's proportions instead of becoming cramped or sparse.
  headingSize: 14.5,
  lyricsSize: 13.25,
  chordsSize: 13.25,
  lineHeight: 1,
  headingColor: KYTARIO_PALETTE.heading,
  lyricsColor: KYTARIO_PALETTE.lyrics,
  chordsColor: KYTARIO_PALETTE.chords,
  paperTint: KYTARIO_PALETTE.paper,
  cover: true,
  contents: true,
  showMetadata: true,
  showSectionLabels: true,
  songOrder: 'title',
};

/**
 * Width of one column on Kytario's own print page: a 1050 px page with 20 px
 * side padding, split in two. Type sizes are expressed against this width so
 * the number of characters per line matches Kytario on any paper size.
 */
export const REFERENCE_COLUMN_PX = 505;

const SETTINGS_KEY = 'printario.settings.v2';

export function getColumnCount(settings, geometry) {
  if (settings.columns === 'one') return 1;
  if (settings.columns === 'two') return 2;
  const landscape = geometry?.landscape ?? settings.orientation === 'landscape';
  return landscape ? 2 : 1;
}

/**
 * Scale the reference type sizes to the actual column width. This keeps the
 * number of characters per line roughly constant on every paper size, which is
 * what makes Kytario's two-column print layout work.
 */
export function getTypeScale(geometry, columns) {
  const columnWidth = columns === 2 ? geometry.contentWidthPx / 2 : geometry.contentWidthPx;
  const scale = columnWidth / REFERENCE_COLUMN_PX;
  return Math.max(0.5, Math.min(2.4, scale));
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, margins: { ...DEFAULT_MARGINS } };
    const saved = JSON.parse(raw);
    const merged = {
      ...DEFAULT_SETTINGS,
      ...saved,
      margins: { ...DEFAULT_SETTINGS.margins, ...(saved?.margins ?? {}) },
    };
    delete merged.autoFit;
    delete merged.autoFitStrength;
    delete merged.autoFitFill;
    delete merged.pageNumbers;
    if (!PAPER_SIZES[merged.paper]) merged.paper = DEFAULT_SETTINGS.paper;
    if (!['portrait', 'landscape'].includes(merged.orientation)) merged.orientation = 'landscape';
    if (!['auto', 'one', 'two'].includes(merged.columns)) merged.columns = 'auto';
    if (!FONT_STACKS[merged.fontFamily]) merged.fontFamily = 'inter';
    if (merged.songOrder === 'original') merged.songOrder = 'title';
    if (!['manual', 'title', 'author'].includes(merged.songOrder)) {
      merged.songOrder = DEFAULT_SETTINGS.songOrder;
    }
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS, margins: { ...DEFAULT_MARGINS } };
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
