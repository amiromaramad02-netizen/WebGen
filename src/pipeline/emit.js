import path from 'node:path';
import { writeFileSafe, ensureDir, listFilesRecursive, readTextIfExists } from '../util/fsx.js';
import { resolveInRoot } from '../util/paths.js';
import { log } from '../util/logger.js';

const MAX_FILE_BYTES = 256000;

/**
 * Writes model output to disk under a site directory.
 * Every path goes through the resolver, so a model can never escape its folder.
 */
export async function emitFile(siteDir, relativePath, contents) {
  const abs = resolveInRoot(siteDir, relativePath);
  if (!abs) {
    log.warn(`emit: rejected unsafe path "${relativePath}"`);
    return { ok: false, reason: 'unsafe-path' };
  }
  let text = String(contents ?? '');
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-z]*\n/i, '').replace(/```\s*$/i, '');
  }
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_FILE_BYTES) {
    return { ok: false, reason: 'too-large', bytes };
  }
  await writeFileSafe(abs, text);
  return { ok: true, path: relativePath, bytes, abs };
}

export async function readSiteFile(siteDir, relativePath) {
  const abs = resolveInRoot(siteDir, relativePath);
  if (!abs) return null;
  return readTextIfExists(abs);
}

export async function readSiteFileMap(siteDir, { includeBinary = false } = {}) {
  const out = {};
  for (const rel of await listFilesRecursive(siteDir)) {
    if (rel.startsWith('.')) continue;
    if (!includeBinary && /\.(png|jpe?g|webp|ico|woff2?|ttf)$/i.test(rel)) continue;
    const text = await readSiteFile(siteDir, rel);
    if (text !== null) out[rel] = text;
  }
  return out;
}

export async function fileExists(siteDir, relativePath) {
  const abs = resolveInRoot(siteDir, relativePath);
  if (!abs) return false;
  return (await readTextIfExists(abs)) !== null;
}

/* ------------------------------------------------------- build-time inlining */

/**
 * Inlines the shared stylesheet and script into every page.
 *
 * This is what makes the exported ZIP work from file:// with no server, and it
 * removes two render-blocking round trips. Each page keeps only its own
 * page-specific <style> rules.
 */
export function inlineSharedAssets(html, { css, js } = {}) {
  // Idempotent: buildSite runs after every write pass, so an earlier injection
  // must be replaced, never stacked.
  let out = stripInjected(html);

  if (css) {
    const linkRe = /<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi;
    if (linkRe.test(out)) {
      out = out.replace(linkRe, '');
    } else {
      // model may have written the link with href before rel
      out = out.replace(/<link\b(?=[^>]*href=["'][^"']*\.css["'])[^>]*>/gi, '');
    }
    out = injectIntoHead(out, `<style data-shared>\n${css}\n</style>`);
  }
  if (js) {
    out = out.replace(/<script\b(?=[^>]*\bsrc=["'][^"']*\.js["'])[^>]*>\s*<\/script>/gi, '');
    out = injectBeforeBodyClose(out, `<script data-shared>\n${js}\n</script>`);
  }
  return out;
}

/** Removes blocks a previous buildSite() injected into this page. */
function stripInjected(html) {
  return html
    .replace(/<style data-shared>\n?[\s\S]*?<\/style>\n?/gi, '')
    .replace(/<script data-shared>\n?[\s\S]*?<\/script>\n?/gi, '');
}

function injectIntoHead(html, snippet) {
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${snippet}\n</head>`);
  const bodyOpen = html.search(/<body[^>]*>/i);
  if (bodyOpen !== -1) return `${html.slice(0, bodyOpen)}${snippet}\n${html.slice(bodyOpen)}`;
  return `${html}\n${snippet}`;
}

function injectBeforeBodyClose(html, snippet) {
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${snippet}\n</body>`);
  return `${html}\n${snippet}`;
}

/**
 * Post-processes the whole site: inlines shared assets, drops empty leftovers,
 * and writes every page back out. Returns the list of files that changed.
 */
export async function buildSite(siteDir) {
  const css = await readSiteFile(siteDir, 'styles.css');
  const js = await readSiteFile(siteDir, 'app.js');
  const changed = [];

  if (css || js) {
    for (const rel of await listFilesRecursive(siteDir)) {
      if (!rel.endsWith('.html')) continue;
      const original = await readSiteFile(siteDir, rel);
      if (original === null) continue;
      const next = inlineSharedAssets(original, { css, js });
      if (next !== original) {
        await writeFileSafe(resolveInRoot(siteDir, rel), next);
        changed.push(rel);
      }
    }
  }

  // robots.txt must reference a real sitemap
  const sitemap = await readSiteFile(siteDir, 'sitemap.xml');
  if (sitemap) {
    const robotsPath = path.join(siteDir, 'robots.txt');
    const robots = await readTextIfExists(robotsPath);
    if (robots && !/sitemap:/i.test(robots)) {
      await writeFileSafe(robotsPath, `${robots.trimEnd()}\nSitemap: https://example.com/sitemap.xml\n`);
      changed.push('robots.txt');
    }
  }

  await ensureDir(siteDir);
  return changed;
}

export { MAX_FILE_BYTES };
