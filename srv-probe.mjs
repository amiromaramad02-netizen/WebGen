import path from 'node:path';
import fs from 'node:fs/promises';
import http from 'node:http';
const root = '/var/folders/8y/x4wtrj1s60ncgqc5q9y3clhw0000gp/T/wg-mHsXjg';
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  if (rel.endsWith('/')) rel += 'index.html';
  const abs = path.resolve(root, rel);
  log('REQ', urlPath, '->', path.relative(root, abs));
  fs.readFile(abs, (err, data) => {
    if (err) { log('  404'); res.writeHead(404, { 'content-type': 'text/html' }).end('<h1>404</h1>'); return; }
    const ext = path.extname(abs);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };
    log('  200', ext, data.length);
    res.writeHead(200, { 'content-type': types[ext] ?? 'application/octet-stream' }).end(data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
const url = `http://127.0.0.1:${port}/index.html`;
const pw = await import('playwright');
const b = await pw.chromium.launch();
const p = await b.newPage();
p.on('requestfinished', (r) => log('fin', r.url().slice(0, 90)));
p.on('requestfailed', (r) => log('FAIL', r.url().slice(0, 90), r.failure()?.errorText));
try {
  const res = await p.goto(url, { waitUntil: 'load', timeout: 12000 });
  log('status', res.status());
} catch (e) { log('goto err', e.message.split('\n')[0]); }
log('readyState', await p.evaluate(() => document.readyState));
await b.close();
server.closeAllConnections();
server.close();
process.exit(0);
