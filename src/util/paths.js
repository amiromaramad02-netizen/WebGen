import path from 'node:path';

export const ALLOWED_EXTENSIONS = new Set([
  '.html', '.css', '.js', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp',
  '.ico', '.xml', '.txt', '.webmanifest', '.md', '.woff2', '.woff', '.ttf', '.map',
]);

/**
 * Normalises a model-supplied relative path and proves it cannot escape its root.
 * Returns null when the path is unsafe or of a disallowed type.
 */
export function safeRelativePath(input) {
  if (typeof input !== 'string' || input.trim() === '') return null;
  let p = input.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return null; // absolute
  p = path.posix.normalize(p);
  if (p.startsWith('..') || p.includes('/../') || p === '.' || p === '') return null;
  if (p.split('/').some((seg) => seg === '..' || seg === '')) return null;
  const ext = path.posix.extname(p).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) return null;
  if (p.length > 180) return null;
  return p;
}

/** Absolute path for a site-relative file, guaranteed inside rootDir. */
export function resolveInRoot(rootDir, relative) {
  const rel = safeRelativePath(relative);
  if (!rel) return null;
  const root = path.resolve(rootDir);
  const abs = path.resolve(root, rel);
  const withSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (abs !== root && !abs.startsWith(withSep)) return null;
  return abs;
}

/** True when the file is a page we should serve/route (html at any depth). */
export function isHtmlFile(p) {
  return path.extname(p).toLowerCase() === '.html';
}
