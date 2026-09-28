/**
 * Design token generator.
 *
 * Real colour maths, not vibes: OKLCH -> sRGB with gamut clamping, WCAG contrast
 * computed from relative luminance, and automatic correction of any pair that
 * fails its threshold. The :root block this produces is what the page call
 * receives verbatim, so the whole site inherits one coherent system.
 */

import { clamp } from '../util/text.js';

/* ------------------------------------------------------------------ colour */

export function hexToRgb(hex) {
  let h = String(hex ?? '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }) {
  const to = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function relLuminance(rgb) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

export function contrastRatio(hexA, hexB) {
  const a = typeof hexA === 'string' ? hexToRgb(hexA) : hexA;
  const b = typeof hexB === 'string' ? hexToRgb(hexB) : hexB;
  if (!a || !b) return 1;
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = '#ffffff';
const BLACK = '#000000';

/** WCAG contrast is defined in sRGB, so all mixing happens there. */
export function mixHex(a, b, weight = 0.5) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return a;
  const w = clamp(weight, 0, 1);
  return rgbToHex({
    r: ca.r * (1 - w) + cb.r * w,
    g: ca.g * (1 - w) + cb.g * w,
    b: ca.b * (1 - w) + cb.b * w,
  });
}

export function lighten(hex, amount) {
  return mixHex(hex, WHITE, clamp(amount, 0, 1));
}

export function darken(hex, amount) {
  return mixHex(hex, BLACK, clamp(amount, 0, 1));
}

/** Walks lightness in small steps until the ratio against `bg` is satisfied. */
export function ensureContrast(color, bg, minRatio, direction = 'auto') {
  let candidate = color;
  const ratio = () => contrastRatio(candidate, bg);
  const bgLum = relLuminance(hexToRgb(bg) ?? { r: 255, g: 255, b: 255 });
  let dir = direction === 'auto' ? (bgLum > 0.5 ? 'darken' : 'lighten') : direction;
  let step = 0.05;
  for (let i = 0; i < 24 && ratio() < minRatio; i++) {
    candidate = dir === 'darken' ? darken(candidate, step) : lighten(candidate, step);
    step = Math.min(step + 0.02, 0.3);
    if (step >= 0.29) {
      dir = dir === 'darken' ? 'lighten' : 'darken';
      step = 0.05;
    }
  }
  return ratio() >= minRatio ? candidate : dir === 'darken' ? BLACK : WHITE;
}

/** Relative luminance decides which of near-black / near-white reads on a colour. */
export function readableInk(hex) {
  return contrastRatio(hex, WHITE) >= contrastRatio(hex, '#111111') ? WHITE : '#111111';
}

/* -------------------------------------------------------------- oklch work */

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

export function oklchToRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) * 255,
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) * 255,
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s) * 255,
  };
}

export function rgbToOklch(hex) {
  const rgb = typeof hex === 'string' ? hexToRgb(hex) : hex;
  if (!rgb) return { L: 0, C: 0, h: 0 };
  const r = srgbToLinear(rgb.r / 255);
  const g = srgbToLinear(rgb.g / 255);
  const b = srgbToLinear(rgb.b / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

/** Largest in-gamut chroma for a lightness/hue pair, found by bisection. */
function maxChroma(L, h) {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const { r, g, b } = oklchToRgb(L, mid, h);
    if (r >= -0.5 && r <= 255.5 && g >= -0.5 && g <= 255.5 && b >= -0.5 && b <= 255.5) lo = mid;
    else hi = mid;
  }
  return lo;
}

export const RAMP_STEPS = [
  [50, 0.977], [100, 0.945], [200, 0.9], [300, 0.845], [400, 0.775],
  [500, 0.685], [600, 0.588], [700, 0.5], [800, 0.415], [900, 0.33], [950, 0.225],
];

export function generateRamp(hue, chromaScale = 1) {
  const out = {};
  for (const [step, L] of RAMP_STEPS) {
    const cap = maxChroma(L, hue);
    const chroma = Math.min(cap * chromaScale * (step <= 200 ? 0.55 : step >= 800 ? 0.7 : 1), cap);
    const { r, g, b } = oklchToRgb(L, chroma, hue);
    out[String(step)] = rgbToHex({ r, g, b });
  }
  return out;
}

/* -------------------------------------------------------------- composition */

export const DEFAULT_TOKENS = {
  archetype: 'landing-conversion',
  mood: 'calm, confident, precise',
  skills: [],
  rationale: '',
  palette: {
    seed: 'neutral slate with a confident blue accent',
    primary: '#1d4ed8',
    primaryDark: '#1e3a8a',
    primarySoft: '#dbeafe',
    accent: '#f97316',
    accent2: '#0ea5e9',
    background: '#ffffff',
    surface: '#f8fafc',
    surfaceAlt: '#f1f5f9',
    text: '#0f172a',
    textMuted: '#475569',
    border: '#cbd5e1',
    success: '#15803d',
    warning: '#b45309',
    danger: '#b91c1c',
    darkBackground: '#0b1220',
    darkSurface: '#131c2e',
    darkText: '#e8edf6',
  },
  typography: {
    display: '"Iowan Old Style", Georgia, "Times New Roman", serif',
    body: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    displayWeight: 800,
    bodyWeight: 400,
    displayTracking: '-0.03em',
    scale: 1.25,
    baseSize: 17,
    lineHeight: 1.65,
    measure: '68ch',
  },
  space: {
    base: 8,
    sectionY: 'clamp(64px, 8vw, 120px)',
    sectionYMobile: 'clamp(48px, 12vw, 72px)',
    gutter: 'clamp(20px, 5vw, 48px)',
    containerMax: '1200px',
  },
  shape: {
    radiusScale: [0, 6, 12, 20, 999],
    borderWidth: ['1px', '2px'],
    elevation: [
      '0 1px 2px hsl(220 30% 12% / 0.06)',
      '0 8px 24px hsl(220 30% 12% / 0.10)',
      '0 24px 48px hsl(220 30% 12% / 0.14)',
    ],
  },
  motion: {
    duration: '180ms',
    easing: 'cubic-bezier(.2,.8,.2,1)',
    techniques: ['micro-interactions', 'hover-lift', 'scroll-reveal'],
    reducedMotionStrategy:
      '@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; } }',
  },
};

function hex(value, fallback) {
  return hexToRgb(value) ? rgbToHex(hexToRgb(value)) : fallback;
}

/** Deep-merges model output over defaults and repairs every colour that fails. */
export function normaliseTokens(design = {}) {
  const d = { ...DEFAULT_TOKENS, ...design };
  const p = { ...DEFAULT_TOKENS.palette, ...(design.palette ?? {}) };

  for (const key of [
    'primary', 'primaryDark', 'accent', 'accent2', 'background', 'surface', 'surfaceAlt',
    'text', 'textMuted', 'border', 'success', 'warning', 'danger',
    'darkBackground', 'darkSurface', 'darkText',
  ]) {
    p[key] = hex(p[key], DEFAULT_TOKENS.palette[key]);
  }

  p.primarySoft = mixHex(p.primary, p.background, 0.88);
  p.primaryDark = darken(p.primary, 0.18);
  p.onPrimary = readableInk(p.primary);
  p.onAccent = readableInk(p.accent);
  p.text = ensureContrast(p.text, p.background, 7, 'darken');
  p.textMuted = ensureContrast(p.textMuted, p.background, 4.5, 'darken');
  p.textMutedOnSurface = ensureContrast(p.textMuted, p.surface, 4.5, 'darken');
  p.border = ensureContrast(p.border, p.background, 1.4, 'darken');
  p.darkText = ensureContrast(p.darkText, p.darkBackground, 7, 'lighten');

  return {
    ...d,
    palette: p,
    typography: { ...DEFAULT_TOKENS.typography, ...(design.typography ?? {}) },
    space: { ...DEFAULT_TOKENS.space, ...(design.space ?? {}) },
    shape: { ...DEFAULT_TOKENS.shape, ...(design.shape ?? {}) },
    motion: { ...DEFAULT_TOKENS.motion, ...(design.motion ?? {}) },
  };
}

/** The gate the validators assert against. */
export function auditTokens(rawTokens) {
  // Same reason as buildCssVars: onPrimary/onAccent only exist after normalising.
  const p = normaliseTokens(rawTokens).palette;
  const checks = [
    ['body text on background', p.text, p.background, 4.5],
    ['body text on surface', p.text, p.surface, 4.5],
    ['muted text on background', p.textMuted, p.background, 4.5],
    ['muted text on surface', p.textMuted, p.surface, 4.5],
    ['button label on primary', p.onPrimary, p.primary, 4.5],
    ['button label on accent', p.onAccent, p.accent, 4.5],
    ['focus ring on background', p.primary, p.background, 3],
    ['border on background', p.border, p.background, 1.4],
    ['danger on background', p.danger, p.background, 4.5],
    ['dark mode text on dark bg', p.darkText, p.darkBackground, 7],
  ];
  const results = checks.map(([name, fg, bg, min]) => {
    const ratio = contrastRatio(fg, bg);
    return { name, fg, bg, min, ratio: Math.round(ratio * 100) / 100, pass: ratio >= min };
  });
  return { pass: results.every((r) => r.pass), results };
}

function typeSteps(scale, base) {
  const round = (n) => Math.round(n * 100) / 100;
  return {
    '--step--1': round(base * 0.8),
    '--step-0': base,
    '--step-1': round(base * scale),
    '--step-2': round(base * scale ** 2),
    '--step-3': round(base * scale ** 3),
    '--step-4': round(base * scale ** 4),
    '--step-5': round(base * scale ** 5),
    '--step-6': round(base * scale ** 6),
  };
}

const STEP_NAMES = ['--step--1', '--step-0', '--step-1', '--step-2', '--step-3', '--step-4', '--step-5', '--step-6'];
// The fluid range: smallest size at a 360px viewport, largest at 1440px.
const FLUID_FROM_PX = 360;
const FLUID_TO_PX = 1440;
const FLUID_SPREAD = 0.78; // min is 78% of the target size, max is 100%

/** Builds the authoritative :root block. This string goes into the page prompt verbatim. */
export function buildCssVars(rawTokens) {
  // Normalise first: raw or partial tokens otherwise emit "--on-primary: undefined"
  // into the stylesheet of every generated site.
  const tokens = normaliseTokens(rawTokens);
  const p = tokens.palette;
  const t = tokens.typography;
  const s = tokens.space;
  const sh = tokens.shape;
  const mo = tokens.motion;
  const steps = typeSteps(Number(t.scale) || 1.25, Number(t.baseSize) || 17);
  const { L, C, h } = rgbToOklch(p.primary);
  // Sizes are px, not rem: a rem inside clamp() feeds back into itself as the
  // root font-size changes, and a raw "17" suffixed with rem is a 272px body text.
  const stepDecls = STEP_NAMES.map((name) => {
    const max = Number(steps[name].toFixed(2));
    const min = Number((max * FLUID_SPREAD).toFixed(2));
    // Derive the range from the rounded ends, so calc() lands exactly on the max.
    const range = Number((max - min).toFixed(2));
    return `  ${name}: clamp(${min}px, calc(${min}px + ${range} * (100vw - ${FLUID_FROM_PX}px) / ${FLUID_TO_PX - FLUID_FROM_PX}), ${max}px);`;
  });
  const radii = (sh.radiusScale ?? DEFAULT_TOKENS.shape.radiusScale).slice(0, 5);
  const elevations = (sh.elevation ?? DEFAULT_TOKENS.shape.elevation).slice(0, 3);
  const base = Number(s.base) === 4 ? 4 : 8;

  return [
    ':root {',
    '  color-scheme: light;',
    `  --brand-h: ${Math.round(h)};`,
    `  --brand-l: ${Math.round(L * 100)}%;`,
    `  --brand-c: ${Math.round(C * 1000) / 1000};`,
    '',
    `  --bg: ${p.background};`,
    `  --surface: ${p.surface};`,
    `  --surface-alt: ${p.surfaceAlt};`,
    `  --text: ${p.text};`,
    `  --text-muted: ${p.textMuted};`,
    `  --border: ${p.border};`,
    `  --primary: ${p.primary};`,
    `  --primary-dark: ${p.primaryDark};`,
    `  --primary-soft: ${p.primarySoft};`,
    `  --on-primary: ${p.onPrimary};`,
    `  --accent: ${p.accent};`,
    `  --accent-2: ${p.accent2};`,
    `  --on-accent: ${p.onAccent};`,
    `  --success: ${p.success};`,
    `  --warning: ${p.warning};`,
    `  --danger: ${p.danger};`,
    '',
    `  --font-display: ${t.display};`,
    `  --font-body: ${t.body};`,
    `  --font-mono: ${t.mono};`,
    `  --weight-display: ${Number(t.displayWeight) || 800};`,
    `  --weight-body: ${Number(t.bodyWeight) || 400};`,
    `  --tracking-display: ${t.displayTracking ?? '-0.03em'};`,
    `  --leading-body: ${Number(t.lineHeight) || 1.65};`,
    `  --measure: ${t.measure ?? '68ch'};`,
    ...stepDecls,
    '',
    '  --space-1: ' + base + 'px;',
    `  --space-2: ${base * 2}px;`,
    `  --space-3: ${base * 3}px;`,
    `  --space-4: ${base * 4}px;`,
    `  --space-5: ${base * 6}px;`,
    `  --space-6: ${base * 8}px;`,
    `  --space-7: ${base * 12}px;`,
    `  --space-8: ${base * 16}px;`,
    `  --section-y: ${s.sectionY};`,
    `  --section-y-mobile: ${s.sectionYMobile};`,
    `  --gutter: ${s.gutter};`,
    `  --container-max: ${s.containerMax};`,
    '',
    `  --radius-1: ${radii[0] ?? 0}px;`,
    `  --radius-2: ${radii[1] ?? 6}px;`,
    `  --radius-3: ${radii[2] ?? 12}px;`,
    `  --radius-4: ${radii[3] ?? 20}px;`,
    '  --radius-pill: ' + (radii[4] ?? 999) + 'px;',
    `  --border-w: ${(sh.borderWidth ?? ['1px'])[0] ?? '1px'};`,
    `  --shadow-1: ${elevations[0] ?? '0 1px 2px rgb(0 0 0 / .06)'};`,
    `  --shadow-2: ${elevations[1] ?? '0 8px 24px rgb(0 0 0 / .10)'};`,
    `  --shadow-3: ${elevations[2] ?? '0 24px 48px rgb(0 0 0 / .14)'};`,
    '',
    `  --dur: ${mo.duration ?? '180ms'};`,
    `  --ease: ${mo.easing ?? 'cubic-bezier(.2,.8,.2,1)'};`,
    '}',
    '',
    '[data-theme="dark"] {',
    '  color-scheme: dark;',
    `  --bg: ${p.darkBackground};`,
    `  --surface: ${p.darkSurface};`,
    `  --surface-alt: ${mixHex(p.darkSurface, p.darkText, 0.06)};`,
    `  --text: ${p.darkText};`,
    `  --text-muted: ${ensureContrast(mixHex(p.darkText, p.darkBackground, 0.35), p.darkBackground, 4.5, 'lighten')};`,
    `  --border: ${mixHex(p.darkSurface, p.darkText, 0.22)};`,
    `  --primary-soft: ${mixHex(p.primary, p.darkBackground, 0.82)};`,
    '}',
  ].join('\n');
}

/** Everything the design stage and the page prompt need, in one object. */
export function buildDesignContext(design, skillIds) {
  const tokens = normaliseTokens(design);
  const audit = auditTokens(tokens);
  return {
    tokens,
    audit,
    cssVars: buildCssVars(tokens),
    skills: skillIds ?? tokens.skills ?? [],
  };
}
