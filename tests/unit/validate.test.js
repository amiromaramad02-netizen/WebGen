import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBalanced, extractInlineCss, extractScriptBlocks, extractText, isBlocking, validateCss, validateFileSet, validateHtml, validateJs, validateSeoText, validateSvg } from '../../src/pipeline/validate.js';

const FILE_SET = new Set(['index.html', 'styles.css', 'app.js', 'favicon.svg', 'site.webmanifest', 'robots.txt', 'sitemap.xml']);

const GOOD = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Roast Ritual — coffee that arrives on time</title>
<meta name="description" content="A coffee subscription that arrives before you run out, roasted the day it ships.">
<link rel="icon" href="favicon.svg">
<style>:root{--brand-h:30}a{color:inherit}.skip-link{position:absolute}@media (prefers-reduced-motion:reduce){*{transition:none}}:focus-visible{outline:2px solid}</style>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header><nav aria-label="Main"><a href="index.html">Home</a><button class="nav-toggle" aria-expanded="false" aria-controls="mobile-nav">Menu</button></nav></header>
<main id="main">
<h1>Coffee that arrives before you run out</h1>
<p>Pick a roast, tell us how often, and we ship it the morning it is roasted. Change the plan or pause it whenever you like, with no phone call and no cancellation maze.</p>
<a class="btn" href="#main">Start free</a>
<section id="faq-1"><h2>Questions worth answering</h2>
<p>We roast in small batches, post the day after roasting, and everything lands within a fortnight of the roast date printed on the bag.</p>
<button aria-expanded="false" aria-controls="faq-1">What is it?</button></section>
</main>
<nav id="mobile-nav" hidden aria-label="Mobile"><a href="index.html">Home</a></nav>
<footer><p>&copy; 2026 Roast Ritual. Cancel any time.</p></footer>
<script>document.addEventListener('DOMContentLoaded',function(){});</script>
</body>
</html>`;

// validateHtml/validateCss/validateJs/validateSeoText/validateSvg return a flat
// array of { rule, message, severity }; only validateFileSet returns a report object.
const rules = (list) => new Set((list ?? []).map((f) => f.rule));
const blockOf = (list) => (list ?? []).filter(isBlocking);

test('a well-formed page passes with no failures', () => {
  const r = validateHtml(GOOD, { files: FILE_SET, path: 'index.html' });
  assert.deepEqual(r, [], JSON.stringify(r, null, 1));
});

test('missing document scaffolding is reported once each, as blocking', () => {
  const bare = '<div>hello</div>';
  const found = rules(validateHtml(bare, { files: FILE_SET, path: 'index.html' }));
  for (const rule of ['missing-doctype', 'missing-lang', 'missing-charset', 'missing-viewport', 'missing-h1', 'missing-landmark', 'missing-skip-link', 'no-focus-visible', 'no-reduced-motion', 'thin-content']) {
    assert.ok(found.has(rule), `expected ${rule}, got ${[...found].join(', ')}`);
  }
  assert.equal(found.has('empty-page'), false, 'a bare div is thin, not empty');
  assert.ok(blockOf(validateHtml(bare, { files: FILE_SET, path: 'index.html' })).length >= 8);
});

test('a stub page is blocking, and an empty one is caught as empty', () => {
  const stub = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body></body></html>';
  const found = blockOf(validateHtml(stub, { files: FILE_SET, path: 'index.html' }));
  assert.ok(found.some((f) => f.rule === 'empty-page'), `an empty page must block: ${JSON.stringify(found)}`);
  assert.ok(found.some((f) => f.rule === 'thin-content'));
  assert.ok(found.every((f) => f.severity === 'error'), 'a stub is not a warning');
});

test('unbalanced markup is caught in both directions', () => {
  for (const fragment of ['<p>a</main>', '<p>a<p>b', '<div><p>a</div>']) {
    const page = `${GOOD.slice(0, GOOD.indexOf('<main id="main">'))}<main id="main"><h1>x</h1>${fragment}</main><footer><p>f</p></footer></body></html>`;
    assert.ok(
      rules(validateHtml(page, { files: FILE_SET, path: 'index.html' })).has('unbalanced-html'),
      `expected unbalanced-html for ${fragment}`,
    );
  }
  assert.deepEqual(
    checkBalanced('<p>a<br>b</p><img src="x.png" alt="x">'),
    [],
    'void elements need no closing tag',
  );
  assert.ok(checkBalanced('<p>a</p></div>').some((f) => f.rule === 'unbalanced-html'));
});

test('a dead in-page anchor is blocking, a live one is not', () => {
  const dead = validateHtml(GOOD.replace('href="#main">Start free', 'href="#nope">Start free'), { files: FILE_SET, path: 'index.html' });
  assert.ok(blockOf(dead).some((f) => f.rule === 'broken-anchor'), 'a dead #anchor must block');
  assert.ok(!blockOf(validateHtml(GOOD, { files: FILE_SET, path: 'index.html' })).some((f) => f.rule === 'broken-anchor'));
});

test('a cross-page anchor is not treated as a same-page anchor', () => {
  const html = GOOD.replace('href="#main">Start free', 'href="about.html#main">Start free');
  assert.ok(!blockOf(validateHtml(html, { files: FILE_SET, path: 'index.html' })).some((f) => f.rule === 'broken-anchor'));
});

test('duplicate ids are reported', () => {
  const dup = GOOD.replace('<h1>', '<h1 id="a">').replace('<p>Pick a roast', '<p id="a">Pick a roast');
  assert.ok(rules(validateHtml(dup, { files: FILE_SET, path: 'index.html' })).has('duplicate-id'));
  assert.ok(!rules(validateHtml(GOOD, { files: FILE_SET, path: 'index.html' })).has('duplicate-id'));
});

test('a link to a file that was never written is a failure', () => {
  assert.ok(!rules(validateHtml(GOOD, { files: FILE_SET, path: 'index.html' })).has('broken-link'), 'our own fixture must be clean');
  const extra = GOOD.replace('Start free<', 'Start free<a href="privacy.html">Privacy</a><');
  assert.ok(rules(validateHtml(extra, { files: FILE_SET, path: 'index.html' })).has('broken-link'), 'an unbuilt page is a dead link');
  const asset = GOOD.replace('<a class="btn" href="#main">', '<a class="btn" href="photos/cup.jpg">');
  assert.ok(rules(validateHtml(asset, { files: FILE_SET, path: 'index.html' })).has('broken-link'), 'an unwritten asset is a dead link');
  // The favicon link is exempt: validateFileSet owns favicon presence, and a page
  // may legitimately reference a favicon the model has not written yet.
  const swappedFavicon = GOOD.replace('href="favicon.svg"', 'href="brand/mark.svg"');
  assert.ok(!rules(validateHtml(swappedFavicon, { files: FILE_SET, path: 'index.html' })).has('broken-link'), 'the favicon href is not link-checked');
});

test('mailto links are not dead links and example.com in prose is not spam', () => {
  const mail = GOOD.replace('>Start free<', '>Mail us<').replace('href="#main">Mail us', 'href="mailto:hello@example.com">Mail us');
  assert.ok(validateHtml(mail, { files: FILE_SET, path: 'index.html' }).every((f) => f.rule !== 'broken-link'), 'mailto is not a local file');
  assert.ok(!rules(validateHtml(mail, { files: FILE_SET, path: 'index.html' })).has('broken-link'), 'mailto is not a local file');

  const prose = 'Buy now from example.com';
  assert.ok(!rules(validateHtml(GOOD.replace('Pick a roast, tell us how often, and we ship it the morning it is roasted. Change the plan or pause it whenever you like, with no phone call and no cancellation maze.', prose), { files: FILE_SET, path: 'index.html' })).has('placeholder-copy'),
    'a bare example.com mentioned in prose is not a placeholder');

  const linked = GOOD.replace('Pick a roast, tell us how often, and we ship it the morning it is roasted. Change the plan or pause it whenever you like, with no phone call and no cancellation maze.', 'Buy now');
  const withLink = linked.replace('>Start free<', '>Buy now<').replace('href="#main">Buy now', 'href="https://example.com">Buy now');
  assert.ok(rules(validateHtml(withLink, { files: FILE_SET, path: 'index.html' })).has('placeholder-copy'), 'a real href to example.com is a placeholder');
});

test('a leaked NaN in visible copy is caught, a word containing it is not', () => {
  const copy = 'Pick a roast, tell us how often, and we ship it the morning it is roasted. Change the plan or pause it whenever you like, with no phone call and no cancellation maze.';
  assert.ok(rules(validateHtml(GOOD.replace(copy, 'Total: NaN per month'), { files: FILE_SET, path: 'index.html' })).has('placeholder-copy'));
  assert.ok(rules(validateHtml(GOOD.replace(copy, 'Total: undefined per month'), { files: FILE_SET, path: 'index.html' })).has('placeholder-copy'));
  assert.ok(!rules(validateHtml(GOOD.replace(copy, 'Our NAN-tagged beans and a NaNsby roast'), { files: FILE_SET, path: 'index.html' })).has('placeholder-copy'),
    'the NaN pattern must not fire inside a longer word');
});

test('placeholders left in shipped copy are caught', () => {
  const copy = 'Pick a roast, tell us how often, and we ship it the morning it is roasted. Change the plan or pause it whenever you like, with no phone call and no cancellation maze.';
  for (const bad of ['TODO: write this', 'Lorem ipsum dolor sit amet consectetur', 'your company name here', 'Feature one does the thing']) {
    const found = rules(validateHtml(GOOD.replace(copy, `${copy} ${bad}`), { files: FILE_SET, path: 'index.html' }));
    assert.ok(found.has('placeholder-copy'), `placeholder not caught: ${bad} (got ${[...found].join(', ')})`);
  }
});

test('a page with no title or description is reported', () => {
  const found = rules(validateHtml(GOOD.replace(/<title>.*?<\/title>\n/, '').replace(/<meta name="description"[^>]*>\n/, ''), { files: FILE_SET, path: 'index.html' }));
  assert.ok(found.has('missing-title'), `got ${[...found].join(', ')}`);
  assert.ok(found.has('missing-description'), `got ${[...found].join(', ')}`);
  assert.ok(blockOf(validateHtml(GOOD.replace(/<title>.*?<\/title>\n/, ''), { files: FILE_SET, path: 'index.html' })).some((f) => f.rule === 'missing-title'));
  assert.ok(!rules(validateHtml(GOOD, { files: FILE_SET, path: 'index.html' })).has('missing-title'));
});

test('img needs alt text and dimensions', () => {
  const noAlt = GOOD.replace('<a class="btn" href="#main">', '<img src="cup.jpg"><a class="btn" href="#main">');
  assert.ok(rules(validateHtml(noAlt, { files: FILE_SET, path: 'index.html' })).has('missing-alt'));

  const noDims = GOOD.replace('<a class="btn" href="#main">', '<img src="cup.jpg" alt="A cup"><a class="btn" href="#main">');
  assert.ok(rules(validateHtml(noDims, { files: FILE_SET, path: 'index.html' })).has('img-dimensions'));

  const fine = GOOD.replace('<a class="btn" href="#main">', '<img src="cup.jpg" alt="A cup" width="600" height="400" loading="lazy"><a class="btn" href="#main">');
  assert.ok(!rules(validateHtml(fine, { files: FILE_SET, path: 'index.html' })).has('missing-alt'));
  assert.ok(!rules(validateHtml(fine, { files: FILE_SET, path: 'index.html' })).has('img-dimensions'));
});

test('validateCss accepts the real stylesheet and rejects the broken kinds', () => {
  const good = [
    ':root{--brand-h:30;--step-0:clamp(13.26px,calc(13.26px + 3.74 * (100vw - 360px) / 1080),17px);--text:#111}',
    'body{color:var(--text)}',
    '@media (prefers-reduced-motion:reduce){*{animation:none}}',
    '@media (min-width:768px){.wrap{display:grid}}',
  ].join('');
  assert.deepEqual(validateCss(good, { path: 'styles.css' }), [], 'the shipped stylesheet shape must be clean');

  assert.ok(rules(validateCss('body{color:red;}{', { path: 'styles.css' })).has('unbalanced-css'));
  assert.ok(rules(validateCss('body{}', { path: 'styles.css' })).has('no-tokens'));
  assert.ok(rules(validateCss('body{}', { path: 'styles.css' })).has('not-responsive'));
  assert.ok(rules(validateCss('body{}', { path: 'styles.css' })).has('no-reduced-motion'));
  assert.ok(
    rules(validateCss('@import url("https://fonts.googleapis.com/css2?family=Inter");', { path: 'styles.css' })).has('external-resource'),
    'a Google-Fonts @import breaks the no-external-resources promise',
  );
});

test('validateJs accepts the shipped script and rejects obvious breakage', () => {
  const good = `document.addEventListener('DOMContentLoaded', function () {
  var btn = document.querySelector('.nav-toggle');
  if (!btn) return;
  btn.addEventListener('click', function () {
    btn.setAttribute('aria-expanded', btn.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
  });
});`;
  assert.deepEqual(validateJs(good, { path: 'app.js' }), []);
  assert.ok(rules(validateJs('function (){ var a = ; }', { path: 'app.js' })).size > 0);
});

test('validateSeoText checks robots, sitemap and manifest by their own contract', () => {
  assert.deepEqual(validateSeoText('User-agent: *\nAllow: /\nSitemap: https://acme.com/sitemap.xml', { path: 'robots.txt' }), []);
  assert.ok(rules(validateSeoText('Allow: /', { path: 'robots.txt' })).has('invalid-robots'));
  assert.ok(rules(validateSeoText('User-agent: *\nAllow: /', { path: 'robots.txt' })).has('invalid-robots'), 'robots.txt must point at a sitemap');

  const sitemap = '<urlset><url><loc>https://acme.com/</loc></url></urlset>';
  assert.deepEqual(validateSeoText(sitemap, { path: 'sitemap.xml' }), []);
  assert.ok(rules(validateSeoText('<urlset></urlset>', { path: 'sitemap.xml' })).has('invalid-sitemap'), 'a sitemap with no urls must fail');

  const manifest = JSON.stringify({ name: 'Acme', start_url: '/', display: 'standalone' });
  assert.deepEqual(validateSeoText(manifest, { path: 'site.webmanifest' }), []);
  assert.ok(rules(validateSeoText('{not json', { path: 'site.webmanifest' })).has('invalid-manifest'));
});

test('validateSvg accepts a real mark and rejects markup that is not an svg', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#123456"/></svg>';
  assert.deepEqual(validateSvg(svg, 'favicon.svg'), []);
  assert.ok(rules(validateSvg('<div>not an svg</div>', 'favicon.svg')).has('invalid-svg'));
});

test('validateFileSet insists on a real site', () => {
  const empty = validateFileSet({ 'styles.css': 'body{}', 'app.js': '' }, { root: 'sites/x' });
  assert.equal(empty.pass, false);
  const found = rules(empty.failures);
  assert.ok(found.has('missing-index'), 'no index.html must fail');
  assert.ok(found.has('empty-page'), 'an empty app.js must fail');
  const ok = validateFileSet({
    'index.html': GOOD,
    'styles.css': 'body{color:#000}',
    'app.js': 'var a=1;',
    'favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"></svg>',
  }, { root: 'sites/x' });
  assert.ok(!ok.failures.some((f) => f.rule === 'missing-index'), JSON.stringify(ok.failures));
  assert.equal(typeof ok.byPath, 'object');
});

test('extractors cope with awkward input', () => {
  assert.equal(extractText('<p>Hello <b>world</b></p>').includes('Hello'), true);
  assert.match(extractText('<p>Hello</p>'), /Hello/);
  assert.equal(extractInlineCss('<style>a{}</style><p>x</p>'), 'a{}');
  // JSON-LD is data, not behaviour: it must not be linted as script.
  assert.equal(extractScriptBlocks('<script>a()</script><p>x</p><script type="application/ld+json">{"@type":"x"}</script>').length, 1);
  assert.equal(extractText(null).length, 0, 'a null page must not throw');
  assert.equal(extractText(undefined).length, 0);
  assert.equal(extractText('<p></p>').trim(), '');
});
