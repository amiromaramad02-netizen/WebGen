import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TOKENS,
  auditTokens,
  buildCssVars,
  contrastRatio,
  ensureContrast,
  hexToRgb,
  normaliseTokens,
  readableInk,
  rgbToHex,
  rgbToOklch,
} from '../../src/design/tokens.js';

test('type steps stay in a usable pixel range and never use rem', () => {
  const css = buildCssVars(DEFAULT_TOKENS);
  const step = (name) => css.match(new RegExp(`${name}: ([^;]+);`))?.[1] ?? '';
  const body = step('--step-0');
  const h1 = step('--step-6');

  // A rem-suffixed "17" is a 272px body font. Sizes must be px, clamped to px.
  assert.match(body, /px\)/, '--step-0 must resolve in px');
  assert.doesNotMatch(css, /--step-\d:.*rem/);
  assert.doesNotMatch(body, /rem/);

  // Body text must land in a sane range at any viewport.
  const bodyMax = Number(body.match(/,\s*([\d.]+)px\)$/)?.[1]);
  assert.ok(bodyMax >= 15 && bodyMax <= 20, `body type out of range: ${body}`);
  assert.ok(Number(h1.match(/,\s*([\d.]+)px\)$/)?.[1]) <= 90, `h1 too large: ${h1}`);

  // The fluid term must interpolate between the min and max, not add to the min.
  assert.match(body, /clamp\(\s*[\d.]+px,\s*calc\(\s*[\d.]+px \+ [\d.]+ \* \(100vw - 360px\) \/ 1080\),\s*[\d.]+px\)/);
  for (const name of ['--step--1', '--step-0', '--step-1', '--step-2', '--step-3', '--step-4', '--step-5', '--step-6']) {
    const decl = step(name);
    const m = decl.match(/clamp\(([\d.]+)px, calc\(([\d.]+)px \+ ([\d.]+) \* \(100vw - 360px\) \/ 1080\), ([\d.]+)px\)/);
    assert.ok(m, `${name} is not a well-formed fluid clamp: ${decl}`);
    const [min, minAgain, range, max] = m.slice(1).map(Number);
    assert.equal(min, minAgain, `${name}: calc must start from the clamp minimum`);
    assert.ok(min > 0 && range > 0 && max > min, `${name}: sizes must increase: ${decl}`);
    assert.equal(Number((min + range).toFixed(2)), max, `${name}: min + range must equal max`);
  }
});

test('a smaller base size scales every step down', () => {
  const big = buildCssVars({ ...DEFAULT_TOKENS, typography: { ...DEFAULT_TOKENS.typography, baseSize: 20 } });
  const small = buildCssVars({ ...DEFAULT_TOKENS, typography: { ...DEFAULT_TOKENS.typography, baseSize: 14 } });
  const maxOf = (css) => Number(css.match(/--step-0: .*?,\s*([\d.]+)px\)/)?.[1]);
  assert.ok(maxOf(big) > maxOf(small));
});

test('ensureContrast repairs a failing pair without breaking the brand hue', () => {
  const washed = { ...DEFAULT_TOKENS.palette, primary: '#cfd8ff' };
  const before = rgbToOklch(washed.primary);
  const fixed = ensureContrast(washed.primary, washed.surface, 4.5);
  const after = rgbToOklch(fixed);
  assert.ok(contrastRatio(fixed, washed.surface) >= 4.5, 'repaired pair must pass 4.5:1');
  assert.ok(Math.abs(after.h - before.h) < 12, 'hue must survive the repair');
  assert.deepEqual(Object.keys(hexToRgb(fixed)), ['r', 'g', 'b']);
  assert.equal(rgbToHex({ r: 255, g: 0, b: 0 }), '#ff0000');
});

test('readableInk picks a legible ink for any background', () => {
  for (const bg of ['#000000', '#ffffff', '#1a1a1a', '#f5f5f5', DEFAULT_TOKENS.palette.surface]) {
    const ink = readableInk(bg);
    assert.ok(contrastRatio(ink, bg) >= 4.5, `ink ${ink} on ${bg} is not readable`);
  }
});

test('auditTokens is a self-healing gate with a stable check list', () => {
  const { results, pass } = auditTokens(DEFAULT_TOKENS);
  assert.equal(pass, true, JSON.stringify(results.filter((r) => !r.pass)));

  const names = results.map((r) => r.name);
  for (const expected of ['body text on background', 'body text on surface', 'muted text on surface',
    'button label on primary', 'button label on accent', 'focus ring on background',
    'border on background', 'dark mode text on dark bg']) {
    assert.ok(names.includes(expected), `missing check: ${expected}`);
  }
  for (const r of results) {
    assert.ok(Number.isFinite(r.ratio) && r.ratio > 1, `${r.name} has a bogus ratio: ${r.ratio}`);
    assert.equal(r.pass, r.ratio >= r.min, `${r.name}: pass flag disagrees with the ratio`);
  }

  // A palette the caller hands us badly is repaired on the way in, so the gate
  // still passes — the audit reports, normalisation fixes.
  const repaired = normaliseTokens({ ...DEFAULT_TOKENS, palette: { ...DEFAULT_TOKENS.palette, text: '#e8e8e8', textMuted: '#ededed' } });
  assert.notEqual(repaired.palette.text, '#e8e8e8');
  assert.equal(auditTokens(repaired).pass, true);
});

test('normaliseTokens fills gaps from a partial design and keeps valid input', () => {
  const partial = normaliseTokens({ palette: { primary: '#123456' } });
  assert.equal(partial.palette.primary, '#123456');
  assert.ok(partial.typography.baseSize > 0);
  assert.ok(partial.space.base);
  const full = normaliseTokens(DEFAULT_TOKENS);
  assert.equal(full.typography.baseSize, DEFAULT_TOKENS.typography.baseSize);
  assert.equal(full.palette.primary, DEFAULT_TOKENS.palette.primary);
});

test('buildCssVars is deterministic and contains no placeholders', () => {
  const a = buildCssVars(DEFAULT_TOKENS);
  assert.equal(a, buildCssVars(DEFAULT_TOKENS));
  assert.doesNotMatch(a, /TODO|TBD|undefined|NaN|\[object Object\]/);
  assert.match(a, /^:root \{/m);
  assert.match(a, /--brand-h:/);
});
