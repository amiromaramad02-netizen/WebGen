/**
 * Static validation. No browser, no network — pure inspection of the file set.
 * Every failure carries a `rule` id so the repair prompt can quote it verbatim
 * and so the UI can group failures.
 */
import zlib from 'node:zlib';
import { safeRelativePath } from '../util/paths.js';
import { contrastRatio, hexToRgb } from '../design/tokens.js';

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title']);

const PLACEHOLDER_PATTERNS = [
  { re: /\blorem\s+ipsum\b/i, rule: 'placeholder-copy', message: 'contains lorem ipsum' },
  { re: /\bTODO\b/, rule: 'placeholder-copy', message: 'contains TODO' },
  { re: /\bFIXME\b/, rule: 'placeholder-copy', message: 'contains FIXME' },
  { re: /\byour\s+(company|brand|business)\s+name\b/i, rule: 'placeholder-copy', message: 'contains "your company name"' },
  { re: /\bFeature\s+(one|two|three|1|2|3)\b/i, rule: 'placeholder-copy', message: 'contains a numbered feature placeholder' },
  { re: /\blorem\b/i, rule: 'placeholder-copy', message: 'contains lorem' },
  { re: /\[object Object\]/, rule: 'placeholder-copy', message: 'contains a stringified object' },
  { re: /\bundefined\b(?![^\n]*\btypeof\b)/, rule: 'placeholder-copy', message: 'contains the literal "undefined"' },
  { re: /(?<![\w.])NaN(?![\w])/, rule: 'placeholder-copy', message: 'contains NaN' },
  { re: /\b(?:https?:\/\/|www\.)example\.com/i, rule: 'placeholder-copy', message: 'uses example.com as a real link' },
  { re: /\{\{[A-Za-z_$][\w$]*\}\}/, rule: 'unresolved-template', message: 'contains an unresolved {{template}} token' },
  { re: /<!--\s*(rest of|continue|todo)/i, rule: 'truncated', message: 'contains a truncation comment' },
  { re: /\/\/\s*\.\.\.\s*rest of/i, rule: 'truncated', message: 'contains a truncation comment' },
  { re: /href=["']#["']/i, rule: 'dead-link', message: 'contains href="#" which goes nowhere' },
  { re: /href=["']javascript:/i, rule: 'unsafe-url', message: 'contains a javascript: URL' },
  { re: /on(click|load|error|mouseover)\s*=\s*["']?[^"'\s>]/i, rule: 'inline-handler', message: 'contains an inline event handler attribute' },
  { re: /<script[^>]+src\s*=\s*["']https?:/i, rule: 'external-resource', message: 'loads an external script' },
  { re: /<link[^>]+rel=["']stylesheet["'][^>]+href\s*=\s*["']https?:/i, rule: 'external-resource', message: 'loads an external stylesheet' },
  { re: /@import\s+url\(\s*["']?https?:/i, rule: 'external-resource', message: 'contains an @import of a remote stylesheet' },
  { re: /\beval\s*\(/, rule: 'unsafe-code', message: 'calls eval()' },
  { rule: 'unsafe-code', re: /new\s+Function\s*\(/, message: 'calls new Function()' },
  { re: /document\.write\s*\(/, rule: 'unsafe-code', message: 'calls document.write()' },
  { re: /console\.(log|debug|info)\s*\(/, rule: 'debug-output', message: 'contains console.log/debug output' },
];

const f = (rule, message, extra = {}) => ({ rule, message, severity: 'error', ...extra });

/* ------------------------------------------------------------------ parsing */

export function extractAttributes(attrsText) {
  const attrs = {};
  const re = /([a-zA-Z_:@][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(attrsText))) {
    const name = m[1].toLowerCase();
    attrs[name] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

export function parseTags(html) {
  const tags = [];
  const re = /<\/?([a-zA-Z][-\w]*)((?:"[^"]*"|'[^']*'|[^"'>])*)\/?>/g;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[0];
    const name = m[1].toLowerCase();
    tags.push({
      name,
      raw,
      attrsText: m[2] ?? '',
      attrs: extractAttributes(m[2] ?? ''),
      closing: raw.startsWith('</'),
      selfClosing: raw.endsWith('/>') || VOID_TAGS.has(name),
      line: html.slice(0, m.index).split('\n').length,
    });
  }
  return tags;
}

/**
 * Tag-name stack check. Walks the document with a cursor so raw-text elements
 * (script/style/textarea) are consumed whole rather than parsed for inner tags.
 */
export function checkBalanced(html) {
  const stack = [];
  const problems = [];
  const re = /<\/?([a-zA-Z][-\w]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;
  let m;
  let skipUntil = 0;
  while ((m = re.exec(html))) {
    if (m.index < skipUntil) continue;
    const name = m[1].toLowerCase();
    const closing = m[0].startsWith('</');
    const selfClosing = m[0].endsWith('/>') || VOID_TAGS.has(name);
    const line = html.slice(0, m.index).split('\n').length;

    if (RAW_TEXT_TAGS.has(name) && !closing && !selfClosing) {
      const closeRe = new RegExp(`</${name}\\s*>`, 'i');
      const rest = html.slice(re.lastIndex);
      const closeMatch = closeRe.exec(rest);
      if (!closeMatch) {
        problems.push(f('unbalanced-html', `<${name}> opened at line ${line} is never closed`, { line }));
        break;
      }
      skipUntil = re.lastIndex + closeMatch.index + closeMatch[0].length;
      continue;
    }
    if (VOID_TAGS.has(name) || selfClosing) continue;

    if (closing) {
      const idx = stack.map((e) => e.name).lastIndexOf(name);
      if (idx === -1) {
        problems.push(f('unbalanced-html', `closing </${name}> at line ${line} has no matching opening tag`, { line }));
      } else {
        // Remove the matched tag and everything it wrongly wrapped; only the ones
        // above it are genuinely unclosed. (splice(idx) would leave the match in.)
        const leftOpen = stack.splice(idx);
        for (const u of leftOpen.slice(1)) {
          problems.push(f('unbalanced-html', `<${u.name}> opened at line ${u.line} is never closed`, { line: u.line }));
        }
      }
      continue;
    }
    stack.push({ name, line });
  }
  for (const u of stack) {
    problems.push(f('unbalanced-html', `<${u.name}> opened at line ${u.line} is never closed`, { line: u.line }));
  }
  return problems;
}

export function extractText(html) {
  // A null page body must not take the whole validation pass down with it.
  return String(html ?? '')
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countTags(html, name) {
  const re = new RegExp(`<${name}(?=[\\s/>])`, 'gi');
  return (html.match(re) ?? []).length;
}

/* ------------------------------------------------------------- html checks */

export function validateHtml(html, { files, path: filePath }) {
  const failures = [];
  const tags = parseTags(html);

  failures.push(...checkBalanced(html));

  if (!/^\s*<!doctype html>/i.test(html)) {
    failures.push(f('missing-doctype', 'page must start with <!doctype html>', { severity: 'warning' }));
  }
  if (!/<html[^>]+lang\s*=/i.test(html)) {
    failures.push(f('missing-lang', '<html> has no lang attribute'));
  }
  if (!/<meta[^>]+charset/i.test(html)) {
    failures.push(f('missing-charset', 'no <meta charset> in <head>'));
  }
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) {
    failures.push(f('missing-viewport', 'no viewport meta — the page will not be responsive on mobile'));
  }
  // A page with no title shows a bare URL in search results and in the tab strip.
  if (!/<title\b[^>]*>[^<]+<\/title>/i.test(html)) {
    failures.push(f('missing-title', 'page has no non-empty <title>'));
  }
  if (!/<meta[^>]+name=["']description["'][^>]*content=["'][^"']+["']/i.test(html)) {
    failures.push(f('missing-description', 'page has no meta description'));
  }

  const h1s = tags.filter((t) => t.name === 'h1' && !t.closing);
  if (h1s.length === 0) failures.push(f('missing-h1', 'page has no <h1>'));
  if (h1s.length > 1) failures.push(f('multiple-h1', `page has ${h1s.length} <h1> elements, expected exactly 1`));

  // heading order
  let prevLevel = 0;
  for (const tag of tags) {
    const m = /^h([1-6])$/.exec(tag.name);
    if (!m || tag.closing) continue;
    const level = Number(m[1]);
    if (prevLevel && level > prevLevel + 1) {
      failures.push(f('heading-skip', `<h${prevLevel + 1}> is followed by <h${level}>, skipping a level`, { line: tag.line }));
    }
    prevLevel = level;
  }

  // landmarks
  for (const required of ['header', 'main', 'footer']) {
    if (!tags.some((t) => t.name === required && !t.closing)) {
      failures.push(f('missing-landmark', `page has no <${required}> landmark element`));
    }
  }
  if (tags.some((t) => t.name === 'nav' && !t.closing) &&
      !tags.some((t) => t.name === 'nav' && /aria-label\s*=/.test(t.attrsText))) {
    failures.push(f('unlabelled-nav', 'a <nav> element has no aria-label', { severity: 'warning' }));
  }

  // skip link
  if (!/class=["'][^"']*skip-link/i.test(html)) {
    failures.push(f('missing-skip-link', 'no .skip-link to #main for keyboard users'));
  }

  // links
  const idSet = new Set(tags.filter((t) => !t.closing && t.attrs.id).map((t) => t.attrs.id));
  const seenAnchors = new Set();
  for (const tag of tags) {
    if (tag.closing) continue;
    if (tag.name === 'a') {
      seenAnchors.add(`#${tag.attrs.id ?? tag.line}`);
      const href = tag.attrs.href;
      if (href === undefined) {
        failures.push(f('anchor-without-href', `<a> without an href is not focusable`, { line: tag.line }));
        continue;
      }
      checkHref(href, failures, { files, idSet, line: tag.line, filePath });
    }
    if (tag.name === 'img') {
      const alt = tag.attrs.alt;
      if (alt === undefined) {
        failures.push(f('missing-alt', '<img> has no alt attribute (use alt="" if decorative)', { line: tag.line }));
      }
      if (!tag.attrs.width || !tag.attrs.height) {
        failures.push(f('img-dimensions', '<img> needs explicit width and height to avoid layout shift', { severity: 'warning', line: tag.line }));
      }
      const src = tag.attrs.src ?? '';
      if (/^https?:/i.test(src)) {
        failures.push(f('external-resource', `<img> loads an external image: ${src.slice(0, 60)}`, { line: tag.line }));
      }
    }
    if (tag.name === 'input' || tag.name === 'select' || tag.name === 'textarea') {
      const id = tag.attrs.id;
      const labelled =
        (id && new RegExp(`<label[^>]+for=["']${escapeRe(id)}["']`).test(html)) ||
        tag.attrs['aria-label'] ||
        tag.attrs['aria-labelledby'] ||
        tag.attrs.type === 'hidden';
      if (!labelled) {
        failures.push(f('unlabelled-input', `<${tag.name}${tag.attrs.type ? ` type="${tag.attrs.type}"` : ''}> has no associated <label>`, { line: tag.line }));
      }
    }
  }

  // aria references
  for (const tag of tags) {
    if (tag.closing) continue;
    for (const attr of ['aria-controls', 'aria-labelledby', 'aria-describedby', 'for']) {
      const value = tag.attrs[attr];
      if (!value) continue;
      for (const ref of value.split(/\s+/).filter(Boolean)) {
        if (!idSet.has(ref)) {
          failures.push(f('broken-aria-ref', `${attr}="${ref}" points at an id that does not exist`, { line: tag.line }));
        }
      }
    }
    if (tag.attrs.role === 'tabpanel' && !tag.attrs['aria-labelledby'] && !tag.attrs['aria-label']) {
      failures.push(f('tabpanel-unlabelled', 'role="tabpanel" has no accessible name', { severity: 'warning', line: tag.line }));
    }
  }

  // duplicate ids
  const idCounts = new Map();
  for (const tag of tags) {
    if (tag.closing || !tag.attrs.id) continue;
    idCounts.set(tag.attrs.id, (idCounts.get(tag.attrs.id) ?? 0) + 1);
  }
  for (const [id, count] of idCounts) {
    if (count > 1) failures.push(f('duplicate-id', `id="${id}" appears ${count} times`));
  }

  // disclosure wiring
  for (const tag of tags) {
    if (tag.closing || tag.name !== 'button') continue;
    const ariaExpanded = tag.attrs['aria-expanded'];
    const isToggle = ariaExpanded !== undefined;
    if (isToggle && !tag.attrs['aria-controls']) {
      failures.push(f('aria-expanded-without-controls', 'button has aria-expanded but no aria-controls', { line: tag.line }));
    }
  }

  // focus styles + reduced motion
  const inlineCss = extractInlineCss(html);
  if (!/:focus-visible/.test(inlineCss)) {
    failures.push(f('no-focus-visible', 'no :focus-visible styling anywhere in the page', { severity: 'error' }));
  }
  if (!/prefers-reduced-motion/.test(inlineCss)) {
    failures.push(f('no-reduced-motion', 'no prefers-reduced-motion block', { severity: 'error' }));
  }

  // placeholder scan on visible text only
  const text = extractText(html);
  if (text.length === 0) {
    failures.push(f('empty-page', 'page has no visible content at all — the model returned a stub or an empty file'));
    return failures;
  }
  for (const p of PLACEHOLDER_PATTERNS) {
    if (p.rule === 'unsafe-code' || p.rule === 'debug-output' || p.rule === 'external-resource') continue;
    if (p.re.test(text) && p.rule === 'placeholder-copy') {
      failures.push(f(p.rule, `visible copy ${p.message}`));
    }
  }
  if (text.length < 200) {
    failures.push(f('thin-content', `only ${text.length} characters of visible copy — the page reads as a skeleton`, { severity: 'error' }));
  }

  // external network references anywhere in the document
  const external = html.match(/(?:src|href|data-src)\s*=\s*["']https?:\/\/[^"']+/gi) ?? [];
  const metaUrls = (html.match(/https?:\/\/[^"'<> ]+/g) ?? []).filter((u) => !/example\.com|schema\.org/.test(u));
  if (metaUrls.length) {
    failures.push(f('external-reference', `references an external URL: ${metaUrls[0].slice(0, 70)}`));
  }
  void external;

  // structural scripts
  for (const script of extractScriptBlocks(html)) {
    for (const p of PLACEHOLDER_PATTERNS) {
      if (['unsafe-code', 'debug-output', 'dead-link', 'inline-handler'].includes(p.rule)) continue;
      if (p.re.test(script)) failures.push(f(p.rule, `inline script ${p.message}`));
    }
  }

  return failures;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractInlineCss(html) {
  const blocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const inlineAttrs = [...html.matchAll(/style=["']([^"']+)["']/gi)].map((m) => m[1]);
  return [...blocks, ...inlineAttrs].join('\n');
}

export function extractScriptBlocks(html) {
  return [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((m) => !/type=["'](application\/ld\+json|application\/json|importmap)["']/i.test(m[1] ?? ''))
    .map((m) => m[2]);
}

function checkHref(href, failures, { files, idSet, line, filePath }) {
  if (/^(https?:|mailto:|tel:|sms:|data:)/i.test(href)) return;
  if (href === '' || href === '#') {
    failures.push(f('dead-link', `href="${href}" goes nowhere`, { line }));
    return;
  }
  if (href.startsWith('#')) {
    if (!idSet.has(href.slice(1))) {
      failures.push(f('broken-anchor', `href="${href}" points at an anchor that does not exist on this page`, { line }));
    }
    return;
  }
  const [pathPart, hash] = href.split('#');
  if (!pathPart) return;
  const dir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
  const resolved = normalisePath(dir ? `${dir}/${pathPart}` : pathPart);
  if (!safeRelativePath(resolved)) {
    failures.push(f('unsafe-path', `link target "${href}" is not a safe in-bundle path`, { line }));
    return;
  }
  if (files && !files.has(resolved) && !files.has(`${resolved}/index.html`)) {
    failures.push(f('broken-link', `links to "${href}" which does not exist in the site`, { line, hint: 'link to an existing page or remove the link' }));
  }
  void hash;
}

function normalisePath(p) {
  const parts = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

/* ------------------------------------------------------------- css checks */

export function validateCss(css, { path: filePath } = {}) {
  const failures = [];
  let depth = 0;
  for (const ch of stripStringsAndComments(css)) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
  }
  if (depth !== 0) failures.push(f('unbalanced-css', `CSS has ${depth > 0 ? 'unclosed' : 'extra closing'} braces`));

  // The reduced-motion block legitimately needs !important to win against animations.
  const withoutReducedMotion = css.replace(/@media\s*\(prefers-reduced-motion[^{]*\{([\s\S]*?)\n\}/g, '');
  const important = (withoutReducedMotion.match(/!\s*important/gi) ?? []).length;
  if (important > 5) {
    failures.push(f('important-spam', `${important} uses of !important outside the reduced-motion block — the cascade is being fought`, { severity: 'warning' }));
  }

  for (const p of PLACEHOLDER_PATTERNS) {
    if (p.rule !== 'external-resource') continue;
    if (p.re.test(css)) failures.push(f('external-resource', `CSS ${p.message}`));
  }
  if (/@font-face/.test(css)) {
    const srcUrls = [...css.matchAll(/@font-face[\s\S]*?src:([^;}]*)/gi)].map((m) => m[1]);
    if (srcUrls.some((s) => /https?:/.test(s))) {
      failures.push(f('external-resource', 'CSS loads a font from the network'));
    }
  }

  const rawHex = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
    .map((m) => m[0])
    .filter((h) => !/^#(main|menu|mobile|page|post|primary|support|skip|hero|faq|cta|nav|footer|header|form|field|pill|plan|price|step|stat|tag|tab|quote|trust|btn|art|blob|mesh|pattern|grain|divider|modal|is-|reveal|icon|feature|logo|marquee|site|prose|lede|muted|eyebrow|card|badge|table|timeline|testimonial|avatar|container|grid|stack|cluster|split|section|surface)/i.test(h));
  if (rawHex.length > 4 && !/:\s*root\b/.test(css.slice(0, css.indexOf(rawHex[0])) + 'x')) {
    // a few raw hex outside :root is acceptable (e.g. SVG data URIs); many is a smell
    failures.push(f('raw-hex', `${rawHex.length} raw hex colours outside the token system (e.g. ${rawHex[0]})`, { severity: 'warning' }));
  }
  if (!/:root/.test(css)) {
    failures.push(f('no-tokens', 'stylesheet has no :root custom properties', { severity: 'warning' }));
  }
  if (!/@media\s*\(prefers-reduced-motion/.test(css)) {
    failures.push(f('no-reduced-motion', 'stylesheet has no prefers-reduced-motion block'));
  }
  if (!/@media[^{]*max-width/.test(css) && !/@media[^{]*min-width/.test(css)) {
    failures.push(f('not-responsive', 'stylesheet has no media queries at all', { severity: 'warning' }));
  }
  void filePath;
  return failures;
}

function stripStringsAndComments(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\\[\s\S]?/g, '')
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
}

/* -------------------------------------------------------------- js checks */

export function validateJs(js, { path: filePath } = {}) {
  const failures = [];
  const stripped = stripJsComments(js);

  for (const p of PLACEHOLDER_PATTERNS) {
    if (!['unsafe-code', 'debug-output', 'external-resource', 'truncated'].includes(p.rule)) continue;
    if (p.re.test(stripped)) failures.push(f(p.rule, `script ${p.message}`));
  }

  if (/\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|navigator\.sendBeacon/.test(stripped)) {
    failures.push(f('network-call', 'script makes a network request — the site must be fully self-contained'));
  }
  if (/\bimport\s|\bexport\s/.test(stripped) && !/type=["\']module/.test('')) {
    failures.push(f('unsupported-module', 'script uses ES module syntax but is loaded as a classic script'));
  }

  try {
    // Syntax-only parse. No execution, no globals.
    // eslint-disable-next-line no-new-func
    new Function(stripped);
  } catch (err) {
    failures.push(f('js-syntax', `script does not parse: ${err.message}`));
  }

  // Budget what actually ships, not the source: 8KB gzipped is the real target.
  const gzipped = zlib.gzipSync(Buffer.from(js, 'utf8'), { level: 9 }).length;
  if (gzipped > 8 * 1024) {
    failures.push(f('js-too-large', `script is ${gzipped} bytes gzipped, over the 8KB budget`, { severity: 'warning' }));
  } else if (stripped.length > 40 * 1024) {
    failures.push(f('js-unwieldy', `script is ${stripped.length} bytes of source (${gzipped} gzipped) — hard to maintain`, { severity: 'warning' }));
  }
  void filePath;
  return failures;
}

function stripJsComments(js) {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/`(?:[^`\\]|\\[\s\S])*`/g, '``');
}

/* ------------------------------------------------------------ svg / seo */

export function validateSvg(svg, { path: filePath } = {}) {
  const failures = [];
  if (!/<svg[\s>]/i.test(svg)) failures.push(f('invalid-svg', 'file does not contain an <svg> element'));
  if (!/viewBox\s*=/i.test(svg)) failures.push(f('invalid-svg', 'SVG has no viewBox, so it cannot scale'));
  if (/<script/i.test(svg)) failures.push(f('unsafe-code', 'SVG contains a script'));
  if (/xlink:href\s*=\s*["']https?:|href\s*=\s*["']https?:/i.test(svg)) {
    failures.push(f('external-resource', 'SVG references an external resource'));
  }
  if (/url\(["']?https?:/.test(svg)) failures.push(f('external-resource', 'SVG background references the network'));
  if (filePath?.endsWith('og-image.svg') && !/viewBox=["']0 0 1200 630["']/.test(svg)) {
    failures.push(f('invalid-og', 'og-image.svg must be exactly viewBox="0 0 1200 630"', { severity: 'warning' }));
  }
  return failures;
}

export function validateSeoText(text, { path: filePath } = {}) {
  const failures = [];
  if (filePath?.endsWith('robots.txt')) {
    if (!/user-agent/i.test(text)) failures.push(f('invalid-robots', 'robots.txt has no user-agent line'));
    if (/disallow:\s*$/im.test(text) === false && !/sitemap:/i.test(text)) {
      failures.push(f('invalid-robots', 'robots.txt does not reference a sitemap', { severity: 'warning' }));
    }
  }
  if (filePath?.endsWith('sitemap.xml')) {
    if (!/<urlset/i.test(text)) failures.push(f('invalid-sitemap', 'sitemap.xml has no <urlset> root'));
    const urls = (text.match(/<loc>/g) ?? []).length;
    if (urls === 0) failures.push(f('invalid-sitemap', 'sitemap.xml lists no URLs'));
    if (/example\.com/.test(text) === false) failures.push(f('invalid-sitemap', 'sitemap.xml has no absolute base URL', { severity: 'warning' }));
  }
  if (filePath?.endsWith('site.webmanifest')) {
    try {
      const parsed = JSON.parse(text);
      for (const key of ['name', 'start_url', 'display']) {
        if (!parsed[key]) failures.push(f('invalid-manifest', `webmanifest is missing "${key}"`));
      }
    } catch {
      failures.push(f('invalid-manifest', 'site.webmanifest is not valid JSON'));
    }
  }
  return failures;
}

export function validateJsonText(text, { path: filePath } = {}) {
  try {
    JSON.parse(text);
    return [];
  } catch (err) {
    return [f('invalid-json', `${filePath} is not valid JSON: ${err.message}`)];
  }
}

/* -------------------------------------------------------- site-level gate */

export function validateFileSet(fileMap) {
  const files = new Set(Object.keys(fileMap));
  const failures = [];
  const byPath = new Map();

  for (const [p, content] of Object.entries(fileMap)) {
    const ext = p.slice(p.lastIndexOf('.')).toLowerCase();
    let fileFailures = [];
    if (ext === '.html') fileFailures = validateHtml(content, { files, path: p });
    else if (ext === '.css') fileFailures = validateCss(content, { path: p });
    else if (ext === '.js') fileFailures = validateJs(content, { path: p });
    else if (ext === '.svg') fileFailures = validateSvg(content, { path: p });
    else if (ext === '.json' || ext === '.webmanifest') fileFailures = validateJsonText(content, { path: p });
    else if (ext === '.xml' || ext === '.txt') fileFailures = validateSeoText(content, { path: p });
    byPath.set(p, fileFailures.map((x) => ({ ...x, file: p })));
    failures.push(...byPath.get(p));
  }

  // site-level requirements
  const htmlFiles = [...files].filter((p) => p.endsWith('.html'));
  if (!htmlFiles.includes('index.html')) {
    failures.push(f('missing-index', 'the site has no index.html', { file: 'index.html' }));
  }
  if (htmlFiles.length > 1 && !files.has('styles.css')) {
    failures.push(f('missing-styles', 'multi-page site has no shared styles.css', { severity: 'warning' }));
  }
  if (htmlFiles.length > 1 && !files.has('app.js')) {
    failures.push(f('missing-script', 'multi-page site has no shared app.js', { severity: 'warning' }));
  }
  if (!files.has('favicon.svg')) {
    failures.push(f('missing-favicon', 'no favicon.svg', { severity: 'warning' }));
  }
  for (const p of htmlFiles) {
    const html = fileMap[p];
    if (!/<link[^>]+rel=["'](?:shortcut )?icon["']/i.test(html) && !/favicon/i.test(html)) {
      failures.push(f('missing-favicon-link', 'page does not reference a favicon', { severity: 'warning', file: p }));
      break;
    }
    if (!/rel=["']canonical["']/i.test(html)) {
      failures.push(f('missing-canonical', 'page has no rel="canonical"', { severity: 'warning', file: p }));
    }
    if (!/og:title/i.test(html)) {
      failures.push(f('missing-og', 'page has no Open Graph tags', { severity: 'warning', file: p }));
    }
    if (!/<meta[^>]+name=["']description["']/i.test(html)) {
      failures.push(f('missing-meta-description', 'page has no meta description', { severity: 'warning', file: p }));
    }
  }
  return { pass: failures.filter((x) => x.severity !== 'info').every((x) => !isBlocking(x)), failures, byPath };
}

function isBlocking(failure) {
  return (failure.severity ?? 'error') === 'error';
}

export { isBlocking, PLACEHOLDER_PATTERNS };
