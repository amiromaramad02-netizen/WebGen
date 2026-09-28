/** Kebab-case slug that is always safe as a path segment. */
export function slugify(input, fallback = 'page') {
  const s = String(input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return s.length ? s.slice(0, 60) : fallback;
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(input) {
  return String(input ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Escape for embedding text inside a <script> JSON payload. */
export function escapeJsonForScript(value) {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function escapeRegExp(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function titleCase(input) {
  return String(input ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export function truncate(input, max = 120) {
  const s = String(input ?? '');
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function uniq(list) {
  return Array.from(new Set(list));
}

export function pick(list, seed = 0) {
  if (!list.length) return undefined;
  return list[Math.abs(seed) % list.length];
}

/** Deterministic 32-bit hash of a string, used to pick design skills reproducibly. */
export function stableHash(input) {
  let h = 2166136261;
  for (let i = 0; i < String(input).length; i++) {
    h ^= String(input).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
