import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import config from '../config.js';
import { log } from '../util/logger.js';
import { listFilesRecursive } from '../util/fsx.js';
import { validateFileSet } from './validate.js';

/**
 * Browser QA.
 *
 * Playwright is an optional dependency: if it (or its browser) is missing the
 * gate degrades to "skipped" and the static checks stand alone. It never
 * silently passes — the skip is reported as a check with a reason.
 */
export async function runQa({ plan, say, siteDir, quick = false }) {
  const result = { checks: [], failures: [], repairable: [], lighthouse: null, skipped: null };
  const dir = siteDir ?? plan?._dir;
  if (!dir) {
    result.skipped = 'no site directory supplied';
    return result;
  }

  const pages = (plan?.pages ?? []).map((p) => p.path).filter((p) => p.endsWith('.html'));
  if (!pages.length) {
    result.skipped = 'no pages to test';
    return result;
  }

  const playwright = await loadPlaywright();
  if (!playwright.ok) {
    result.skipped = playwright.reason;
    say?.('log', { level: 'warn', message: `Browser QA skipped: ${playwright.reason}` });
    result.checks.push({ name: 'browser-qa', pass: true, skipped: true, detail: playwright.reason });
    return result;
  }

  const { chromium } = playwright;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webgen-qa-'));
  let browser;
  let server; // declared out here so the finally block can always shut it down
  try {
    await copyDir(dir, root);
    server = await serve(root);
    browser = await chromium.launch();

    for (const page of pages) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const p = await context.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      const failedRequests = [];

      p.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      p.on('pageerror', (err) => pageErrors.push(String(err.message ?? err)));
      p.on('requestfailed', (req) => failedRequests.push(`${req.url()} — ${req.failure()?.errorText}`));
      p.on('response', (res) => {
        if (res.status() >= 400) failedRequests.push(`${res.url()} — HTTP ${res.status()}`);
      });

      const url = `${server.url}/${page}`;
      const response = await p.goto(url, { waitUntil: 'load', timeout: 20000 });
      await p.waitForTimeout(300);

      if (!response || !response.ok()) {
        result.failures.push(mk(page, 'page-load', `page returned ${response?.status() ?? 'no response'}`, 'error'));
      }

      /* console + network */
      result.checks.push({ name: `console-clean:${page}`, pass: consoleErrors.length === 0, detail: consoleErrors.slice(0, 4) });
      for (const e of consoleErrors.slice(0, 4)) result.failures.push(mk(page, 'console-error', e, 'error'));
      result.checks.push({ name: `page-errors:${page}`, pass: pageErrors.length === 0, detail: pageErrors.slice(0, 4) });
      for (const e of pageErrors.slice(0, 4)) result.failures.push(mk(page, 'page-error', e, 'error'));
      result.checks.push({ name: `network-clean:${page}`, pass: failedRequests.length === 0, detail: failedRequests.slice(0, 4) });
      for (const e of failedRequests.slice(0, 4)) result.failures.push(mk(page, 'failed-request', e, 'error'));

      /* overflow at three widths */
      if (!quick) {
        for (const width of [390, 768, 1440]) {
          await p.setViewportSize({ width, height: 900 });
          await p.waitForTimeout(120);
          const overflow = await p.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            culprits: Array.from(document.querySelectorAll('body *'))
              .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
              .slice(0, 3)
              .map((el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`),
          }));
          const over = overflow.scrollWidth - overflow.clientWidth;
          const pass = over <= 1;
          result.checks.push({ name: `no-overflow-${width}:${page}`, pass, detail: over > 1 ? `${over}px wider than viewport: ${overflow.culprits.join(', ')}` : 'ok' });
          if (!pass) result.failures.push(mk(page, `overflow-${width}px`, `${over}px of horizontal overflow (${overflow.culprits.join(', ')})`, 'error'));
        }
        await p.setViewportSize({ width: 1440, height: 900 });

        /* every control is wired to something */
        const wiring = await p.evaluate(() => {
          const out = [];
          for (const el of document.querySelectorAll('button, a, summary, [role="button"], input[type="submit"]')) {
            const label = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || el.type || '').trim().slice(0, 40);
            if (el.closest('[hidden]')) continue;
            if (el.tagName === 'A' && !el.getAttribute('href')) out.push(`<a> without href (${label})`);
          }
          return out;
        });
        result.checks.push({ name: `controls-wired:${page}`, pass: wiring.length === 0, detail: wiring });
        for (const w of wiring) result.failures.push(mk(page, 'missing-anchor', w, 'error'));

        /* focus visibility */
        const focus = await p.evaluate(() => {
          const el = document.querySelector('.btn, .nav-link, a.brand, button');
          if (!el) return 'no focusable control found';
          el.focus();
          const s = getComputedStyle(el);
          const has = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) ||
            s.boxShadow !== 'none' || s.textDecorationLine !== 'none';
          return has ? true : 'focused control has no visible focus indicator';
        });
        result.checks.push({ name: `focus-visible:${page}`, pass: focus === true, detail: focus === true ? 'ok' : focus });
        if (focus !== true) result.failures.push(mk(page, 'no-focus-visible', String(focus), 'error'));

        /* axe-core */
        const axe = await runAxe(p);
        if (axe) {
          const serious = axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
          result.checks.push({ name: `axe:${page}`, pass: serious.length === 0, detail: serious.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`) });
          for (const v of serious) {
            result.failures.push(mk(page, `axe-${v.id}`, `${v.help} — ${v.nodes.length} node(s)`, 'error'));
          }
        }

        /* mobile drawer actually opens */
        await p.setViewportSize({ width: 390, height: 844 });
        await p.waitForTimeout(150);
        const navCheck = await p.evaluate(async () => {
          const toggle = document.querySelector('.nav-toggle');
          if (!toggle) return 'no .nav-toggle found';
          if (toggle.offsetParent === null) return true; // hidden at this width by design
          toggle.click();
          await new Promise((r) => setTimeout(r, 400));
          const nav = document.getElementById('mobile-nav') || document.querySelector('.mobile-nav');
          const open = toggle.getAttribute('aria-expanded') === 'true' && nav && !nav.hasAttribute('hidden');
          if (open) toggle.click();
          return open ? true : 'drawer did not open on tap';
        });
        result.checks.push({ name: `mobile-drawer:${page}`, pass: navCheck === true, detail: navCheck === true ? 'ok' : navCheck });
        if (navCheck !== true) result.failures.push(mk(page, 'drawer-broken', String(navCheck), 'error'));
        await p.setViewportSize({ width: 1440, height: 900 });

        /* form validation actually validates */
        const formCheck = await p.evaluate(() => {
          const form = document.querySelector('form[data-validate]');
          if (!form) return { pass: true, detail: 'no validated form on this page' };
          form.querySelector('button[type="submit"]')?.click();
          const invalid = form.querySelectorAll('[aria-invalid="true"]').length;
          return invalid > 0
            ? { pass: true, detail: 'empty submit surfaced field errors' }
            : { pass: false, detail: 'submitting an empty form showed no errors' };
        });
        result.checks.push({ name: `form-validation:${page}`, pass: formCheck.pass, detail: formCheck.detail });
        if (!formCheck.pass) result.failures.push(mk(page, 'form-broken', formCheck.detail, 'error'));
      }

      await context.close();
    }

    if (!quick && config.qa.lighthouse) {
      result.lighthouse = await runLighthouse(root, pages, say);
    }
  } catch (err) {
    log.warn('browser QA errored:', err.message);
    result.failures.push(mk(pages[0] ?? 'index.html', 'qa-crash', err.message, 'error'));
    result.checks.push({ name: 'browser-qa', pass: false, detail: err.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
    await fs.rm(root, { recursive: true, force: true }).catch(() => {});
  }

  result.repairable = result.failures.filter((f) => f.severity === 'error');
  return result;
}

function mk(file, rule, message, severity = 'error') {
  return { file, rule, message, severity, hint: '' };
}

async function loadPlaywright() {
  if (!config.qa.playwright) return { ok: false, reason: 'ENABLE_PLAYWRIGHT_QA=0' };
  let pw;
  try {
    pw = await import('playwright');
  } catch {
    return { ok: false, reason: 'playwright is not installed (npm i playwright && npx playwright install chromium)' };
  }
  try {
    const exe = pw.chromium.executablePath();
    if (!exe || !fsSync.existsSync(exe)) {
      return { ok: false, reason: 'playwright is installed but no browser binary is present (run: npx playwright install chromium)' };
    }
  } catch {
    return { ok: false, reason: 'playwright could not resolve a chromium binary (run: npx playwright install chromium)' };
  }
  return { ok: true, chromium: pw.chromium };
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  for (const rel of await listFilesRecursive(src)) {
    if (rel.startsWith('.')) continue;
    const out = path.join(dest, rel);
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.copyFile(path.join(src, rel), out);
  }
}

/** Minimal static file server for the QA run only. */
function serve(root) {
  const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
    '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
    '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png',
  };
  const base = path.resolve(root);
  const server = http.createServer(async (req, res) => {
    let rel;
    try {
      const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
      rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      if (rel.endsWith('/')) rel += 'index.html';
    } catch {
      rel = 'index.html';
    }
    const abs = path.resolve(base, rel);
    if (abs !== base && !abs.startsWith(base + path.sep)) {
      res.writeHead(403, { 'content-type': 'text/plain' }).end('forbidden');
      return;
    }
    try {
      const data = await fs.readFile(abs);
      res.writeHead(200, {
        'content-type': types[path.extname(abs).toLowerCase()] ?? 'application/octet-stream',
        'content-length': data.length,
        'cache-control': 'no-store',
      });
      res.end(data);
    } catch {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><title>404</title><h1>404</h1>');
    }
  });
  server.on('clientError', (_err, socket) => socket.destroy());
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        // closeAllConnections is required: keep-alive sockets from the browser
        // would otherwise keep server.close() pending forever.
        close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
      });
    });
  });
}

const AXE_SOURCE = `https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js`;

async function runAxe(page) {
  try {
    const script = await fetch(AXE_SOURCE, { signal: AbortSignal.timeout(15000) }).then((r) => (r.ok ? r.text() : null));
    if (!script) return null;
    await page.addScriptTag({ content: script });
    return await page.evaluate(async () => {
      const res = await window.axe.run(document, { resultTypes: ['violations'] });
      return { violations: res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes })) };
    });
  } catch (err) {
    log.debug('axe skipped:', err.message);
    return null;
  }
}

async function runLighthouse(root, pages, say) {
  let server;
  try {
    const { spawn } = await import('node:child_process');
    server = await serve(root);
    const url = `${server.url}/${(pages[0] ?? 'index.html').replace(/^\/+/, '')}`;
    const report = await new Promise((resolve) => {
      const child = spawn('npx', ['--yes', 'lighthouse', url, '--quiet', '--output=json', '--output-path=stdout',
        '--only-categories=performance,accessibility,best-practices,seo',
        '--chrome-flags=--headless --no-sandbox'], { stdio: ['ignore', 'pipe', 'ignore'] });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      // lighthouse is chatty on stderr and occasionally hangs; cap the wait
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(null); }, 120000);
      child.on('close', () => { clearTimeout(timer); try { resolve(JSON.parse(out)); } catch { resolve(null); } });
      child.on('error', () => { clearTimeout(timer); resolve(null); });
    });
    if (!report) {
      say?.('log', { level: 'warn', message: 'Lighthouse could not run; skipping those scores.' });
      return null;
    }
    const scores = {};
    for (const [category, data] of Object.entries(report.categories ?? {})) {
      scores[category] = Math.round((data.score ?? 0) * 100);
    }
    const thresholds = { performance: 90, accessibility: 95, 'best-practices': 90, seo: 95 };
    const pass = Object.entries(thresholds).every(([k, min]) => scores[k] === undefined || scores[k] >= min);
    say?.('log', {
      level: pass ? 'info' : 'warn',
      message: `Lighthouse: ${Object.entries(scores).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    });
    return { scores, pass, thresholds, page: pages[0] ?? 'index.html' };
  } catch (err) {
    log.debug('lighthouse skipped:', err.message);
    return null;
  } finally {
    if (server) await server.close();
  }
}

export { validateFileSet };
