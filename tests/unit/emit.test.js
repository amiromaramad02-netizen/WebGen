import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSite, emitFile, fileExists, inlineSharedAssets, readSiteFile, readSiteFileMap } from '../../src/pipeline/emit.js';
import { ALLOWED_EXTENSIONS, isHtmlFile, resolveInRoot, safeRelativePath } from '../../src/util/paths.js';

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>T</title>
<link rel="stylesheet" href="styles.css"></head>
<body><main id="main"><h1>Hi</h1></main><script src="app.js"></script></body></html>`;

async function site() {
  const dir = await mkdtemp(path.join(tmpdir(), 'wg-emit-'));
  await writeFile(path.join(dir, 'index.html'), PAGE);
  await writeFile(path.join(dir, 'about.html'), PAGE.replace('<h1>Hi</h1>', '<h1>About</h1>'));
  await writeFile(path.join(dir, 'styles.css'), ':root{--brand-h:250}\nbody{color:var(--text)}');
  await writeFile(path.join(dir, 'app.js'), 'document.addEventListener("DOMContentLoaded",function(){});');
  return dir;
}

test('inlineSharedAssets is idempotent across repeated passes', () => {
  const css = ':root{--brand-h:250}';
  const js = 'var a = 1;';
  let html = inlineSharedAssets(PAGE, { css, js });
  const once = html;
  for (let i = 0; i < 5; i += 1) html = inlineSharedAssets(html, { css, js });

  assert.equal(html, once, 'a second pass must be a no-op, not a second copy');
  assert.equal((html.match(/<style/g) ?? []).length, 1);
  assert.equal((html.match(/<script/g) ?? []).length, 1);
  assert.doesNotMatch(html, /rel="stylesheet"/);
  assert.doesNotMatch(html, /src="app\.js"/);
  assert.match(html, /<style data-shared>/);
  assert.match(html, /<script data-shared>/);
  assert.match(html, /--brand-h:250/);
});

test('inlineSharedAssets leaves a page alone when there is nothing to inline', () => {
  const bare = '<!doctype html><html lang="en"><head><title>T</title></head><body></body></html>';
  assert.equal(inlineSharedAssets(bare, {}), bare);
  assert.equal(inlineSharedAssets(bare), bare);
});

test('inlineSharedAssets drops a link written with href before rel', () => {
  const odd = '<!doctype html><html lang="en"><head><link href="styles.css" rel="stylesheet"></head><body></body></html>';
  const out = inlineSharedAssets(odd, { css: 'body{}' });
  assert.doesNotMatch(out, /<link/);
  assert.match(out, /<style data-shared>/);
});

test('buildSite inlines every page exactly once however often it runs', async () => {
  const dir = await site();
  const changed = await buildSite(dir);
  assert.ok(changed.includes('index.html') && changed.includes('about.html'));

  const first = await readFile(path.join(dir, 'index.html'), 'utf8');
  await buildSite(dir);
  await buildSite(dir);
  const after = await readFile(path.join(dir, 'index.html'), 'utf8');

  assert.equal(after, first, 're-running buildSite must not change the output');
  assert.equal((after.match(/<style/g) ?? []).length, 1);
  assert.equal((after.match(/<script/g) ?? []).length, 1);
});

test('buildSite makes robots.txt point at the sitemap it shipped', async () => {
  const dir = await site();
  await writeFile(path.join(dir, 'sitemap.xml'), '<?xml version="1.0"?><urlset></urlset>');
  await writeFile(path.join(dir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  await buildSite(dir);
  const robots = await readFile(path.join(dir, 'robots.txt'), 'utf8');
  assert.match(robots, /Sitemap: \S+sitemap\.xml/);
  await buildSite(dir);
  assert.equal((await readFile(path.join(dir, 'robots.txt'), 'utf8')).match(/Sitemap:/g).length, 1);
});

test('emitFile refuses paths that escape the site directory', async () => {
  const dir = await site();
  for (const evil of ['../outside.html', '/etc/passwd', 'nested/../../escape.html', 'C:\\win\\x.html']) {
    const res = await emitFile(dir, evil, '<p>nope</p>');
    assert.equal(res.ok, false, `${evil} must be rejected`);
    assert.equal(res.reason, 'unsafe-path');
  }
  assert.equal(await fileExists(dir, 'index.html'), true);
});

test('emitFile strips markdown fences and rejects oversized output', async () => {
  const dir = await site();
  const fenced = await emitFile(dir, 'fenced.html', '```html\n<p>ok</p>\n```');
  assert.equal(fenced.ok, true);
  assert.equal(await readSiteFile(dir, 'fenced.html'), '<p>ok</p>\n', 'the fence is stripped, the trailing newline kept');

  const huge = await emitFile(dir, 'huge.html', 'x'.repeat(300000));
  assert.equal(huge.ok, false);
  assert.equal(huge.reason, 'too-large');
  assert.equal(await fileExists(dir, 'huge.html'), false);
});

test('readSiteFileMap skips binaries and dotfiles', async () => {
  const dir = await site();
  await writeFile(path.join(dir, 'favicon.svg'), '<svg></svg>');
  await writeFile(path.join(dir, '.hidden'), 'secret');
  await writeFile(path.join(dir, 'photo.png'), 'not-really-a-png');
  const map = await readSiteFileMap(dir);
  assert.deepEqual(Object.keys(map).sort(), ['about.html', 'app.js', 'favicon.svg', 'index.html', 'styles.css']);
  assert.ok(map['styles.css'].length > 0);
});

test('safeRelativePath normalises what is safe and refuses what is not', () => {
  assert.equal(safeRelativePath('a/b.html'), 'a/b.html');
  assert.equal(safeRelativePath('./index.html'), 'index.html');
  assert.equal(safeRelativePath('a\\\\b.html'), 'a/b.html', 'Windows separators from a model are normalised');
  for (const evil of ['../a.html', '/etc/passwd', 'a/../../b.html', 'C:/win/x.html', '..', '', '   ', null, 42]) {
    assert.equal(safeRelativePath(evil), null, `${JSON.stringify(evil)} must be refused`);
  }
  assert.equal(safeRelativePath('a'.repeat(200) + '.html'), null, 'absurd paths are refused');

  const root = '/tmp/site';
  assert.equal(resolveInRoot(root, 'index.html'), path.join(root, 'index.html'));
  assert.equal(resolveInRoot(root, 'nested/deep.html'), path.join(root, 'nested/deep.html'));
  assert.equal(resolveInRoot(root, '../escape'), null);
  assert.equal(resolveInRoot(root, '/absolute'), null);
  assert.equal(resolveInRoot(root, `a${path.sep}..${path.sep}b.html`), path.join(root, 'b.html'), 'a detour that stays inside is fine');
  assert.equal(resolveInRoot(root, 'a/../../b.html'), null, 'a detour that escapes is not');
  assert.equal(resolveInRoot(root, 'shell.sh'), null, 'a disallowed extension never resolves');
});

test('extension allowlist covers a shippable site and nothing dangerous', () => {
  for (const good of ['index.html', 'styles.css', 'app.js', 'favicon.svg', 'og-image.png', 'site.webmanifest', 'robots.txt', 'sitemap.xml', 'font.woff2']) {
    assert.ok(ALLOWED_EXTENSIONS.has(path.extname(good)), `${good} should be allowed`);
  }
  for (const bad of ['payload.exe', 'shell.sh', 'secret.env', 'page.php', 'archive.svgz', 'a.bat']) {
    assert.equal(ALLOWED_EXTENSIONS.has(path.extname(bad)), false, `${bad} must not be allowed`);
  }
  assert.equal(isHtmlFile('about.html'), true);
  assert.equal(isHtmlFile('nested/deep.HTML'), true);
  assert.equal(isHtmlFile('notes.txt'), false);
});
