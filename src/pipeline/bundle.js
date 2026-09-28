import path from 'node:path';
import fs from 'node:fs/promises';
import { listFilesRecursive, readTextIfExists } from '../util/fsx.js';
import { resolveInRoot } from '../util/paths.js';
import { log } from '../util/logger.js';

const TEXT_EXT = new Set(['.html', '.css', '.js', '.json', '.svg', '.xml', '.txt', '.webmanifest', '.md']);
const INLINE_DATA_URI_LIMIT = 32 * 1024;

/** Site inventory used by the UI, the deploy adapters and the zip writer. */
export async function inventory(siteDir) {
  const files = [];
  for (const rel of await listFilesRecursive(siteDir)) {
    if (rel.startsWith('.')) continue;
    const abs = resolveInRoot(siteDir, rel);
    if (!abs) continue;
    const stat = await fs.stat(abs);
    files.push({ path: rel, bytes: stat.size, text: TEXT_EXT.has(path.extname(rel).toLowerCase()) });
  }
  return files;
}

/**
 * ZIP of the site. Entries are always forward-slash relative paths produced by
 * listFilesRecursive, and symlinks are never written, so a crafted archive is
 * not possible.
 */
export async function createZip(siteDir, { siteName = 'site' } = {}) {
  const { default: archiver } = await import('archiver');
  const files = await inventory(siteDir);
  const payloads = [];
  for (const f of files) {
    payloads.push({ name: `${siteName}/${f.path}`, data: await fs.readFile(resolveInRoot(siteDir, f.path)) });
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('data', (c) => chunks.push(c));
    archive.on('warning', (err) => log.warn('zip warning:', err.message));
    archive.on('error', (err) => reject(err));
    archive.on('end', () => resolve({ buffer: Buffer.concat(chunks), entries: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0) }));

    for (const p of payloads) archive.append(p.data, { name: p.name });
    archive.finalize();
  });
}

/* -------------------------------------------------------- single-file build */

const MIME = {
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', ico: 'image/x-icon', json: 'application/json',
  webmanifest: 'application/manifest+json', woff2: 'font/woff2', woff: 'font/woff',
  ttf: 'font/ttf',
};

function toDataUri(absolutePath, mime) {
  return fs.readFile(absolutePath).then((buf) => `data:${mime};base64,${buf.toString('base64')}`);
}

/**
 * Collapses the whole site into one index.html that runs from file://.
 *
 * Shared CSS and JS are already inlined by the build step, so this only has to
 * inline the remaining local assets and rewrite the URLs that point at them.
 */
export async function createSingleFile(siteDir, { page = 'index.html' } = {}) {
  const source = resolveInRoot(siteDir, page);
  if (!source) throw new Error('Invalid page path');
  let html = await readTextIfExists(source);
  if (html === null) throw new Error(`${page} not found`);

  const files = await inventory(siteDir);
  const byPath = new Map(files.map((f) => [f.path, f]));

  // Inline any local asset referenced by url() or src that is small enough.
  const refs = new Set();
  for (const m of html.matchAll(/url\((["']?)([^"')]+)\1\)/g)) refs.add(m[2]);
  for (const m of html.matchAll(/\b(?:src|href|content)\s*=\s*["']([^"']+)["']/gi)) refs.add(m[1]);

  const inlined = [];
  for (const ref of refs) {
    if (/^(https?:|data:|mailto:|tel:|#|\/\/)/i.test(ref)) continue;
    const rel = ref.replace(/^\.?\//, '').split(/[?#]/)[0];
    const file = byPath.get(rel);
    if (!file) continue;
    if (!file.text && file.bytes > INLINE_DATA_URI_LIMIT) continue;
    if (file.text) continue; // html/css/js are already linked or inlined
    const abs = resolveInRoot(siteDir, rel);
    if (!abs) continue;
    const mime = MIME[path.extname(rel).slice(1).toLowerCase()] ?? 'application/octet-stream';
    const uri = await toDataUri(abs, mime);
    html = html.split(ref).join(uri);
    inlined.push({ path: rel, bytes: file.bytes });
  }

  // The favicon and manifest cannot be meaningfully inlined; drop the links
  // rather than leave references to files that are not in the bundle.
  html = html
    .replace(/<link[^>]+rel=["'](?:icon|apple-touch-icon|manifest)["'][^>]*>/gi, '')
    .replace(/<link[^>]+rel=["']canonical["'][^>]*>/gi, '');

  html = html.replace(
    /<\/body>/i,
    `<script>document.querySelectorAll('a[href]').forEach(function(a){var h=a.getAttribute('href');if(h&&!h.startsWith('#')&&!h.startsWith('http')&&!h.startsWith('mailto:')){a.setAttribute('href','#');a.setAttribute('data-original-href',h);}});<\/script>\n</body>`,
  );

  return {
    html,
    inlined,
    bytes: Buffer.byteLength(html, 'utf8'),
    droppedReferences: [...refs].filter((r) => !/^(https?:|data:|mailto:|tel:|#|\/\/)/i.test(r)).filter((r) => !inlined.some((i) => i.path === r.replace(/^\.?\//, '').split(/[?#]/)[0])),
  };
}

/* ------------------------------------------------- host-ready manifest files */

export function hostManifests(siteName) {
  return {
    '_headers': `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Permissions-Policy: geolocation=(), microphone=(), camera=()

/*.html
  Cache-Control: no-cache

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`,
    '_redirects': `/  /index.html  200
/*  /index.html  404
`,
    'netlify.toml': `[build]
  publish = "."
  command = ""

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
`,
    'wrangler.toml': `name = "${siteName}"
compatibility_date = "${new Date().toISOString().slice(0, 10)}"
pages_build_output_dir = "."
`,
    '.github/workflows/deploy.yml': `name: Deploy static site
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .
      - id: deployment
        uses: actions/deploy-pages@v4
`,
    '.nojekyll': '',
  };
}
