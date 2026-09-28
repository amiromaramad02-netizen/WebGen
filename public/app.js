const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  siteId: null,
  routes: [],
  route: 'index.html',
  busy: false,
  calls: 0,
  controller: null,
};

const STAGE_IDS = ['analyze', 'plan', 'design-system', 'pages', 'validate', 'repair', 'screenshot', 'bundle'];

/* ------------------------------------------------------------------ theme */

function initTheme() {
  const root = document.documentElement;
  let stored = null;
  try { stored = localStorage.getItem('webgen-theme'); } catch { stored = null; }
  if (stored === 'light' || stored === 'dark') root.setAttribute('data-theme', stored);
  $('#toggle-theme').addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('webgen-theme', next); } catch { /* private mode */ }
  });
}

/* ------------------------------------------------------------------ setup */

function renderProviderPill(mode, label, model) {
  const pill = $('#provider-pill');
  pill.classList.remove('is-live', 'is-mock');
  pill.textContent = mode === 'live' ? `live · ${model}` : mode === 'mock' ? 'mock provider' : 'no key';
  if (mode !== 'unconfigured') pill.classList.add(mode === 'live' ? 'is-live' : 'is-mock');
  if (mode === 'live' && label) pill.title = `${label} key in use`;
}

async function initHealth() {
  try {
    const res = await fetch('/api/health');
    const body = await res.json();
    renderProviderPill(body.provider.mode, body.provider.label, body.provider.model);
    if (body.provider.mode === 'unconfigured') $('#setup').hidden = false;
    await refreshKeyStatus();

    const sel = $('#opt-archetype');
    const res2 = await fetch('/api/archetypes');
    for (const a of (await res2.json()).layout) {
      const opt = document.createElement('option');
      opt.value = a;
      opt.textContent = a.replace(/-/g, ' ');
      sel.append(opt);
    }
  } catch {
    $('#provider-pill').textContent = 'offline';
    $('#provider-pill').classList.add('is-mock');
  }
}

function setKeyStatus(message, kind = 'info') {
  const el = $('#key-status');
  el.textContent = message;
  el.dataset.kind = kind;
}

/** Reflects whatever the server is actually using, without ever showing the key. */
async function refreshKeyStatus() {
  try {
    const body = await (await fetch('/api/key')).json();
    if (body.configured) {
      const where = body.source === 'runtime' ? 'pasted into the browser' : 'read from .env';
      setKeyStatus(`Using a ${body.provider.label} key (${body.fingerprint}), ${where}.`, 'ok');
    } else if (body.mock) {
      setKeyStatus('No key set — running on the mock provider.', 'info');
    } else {
      setKeyStatus('No key set.', 'info');
    }
    renderProviderPill(
      body.configured ? 'live' : body.mock ? 'mock' : 'unconfigured',
      body.provider?.label,
      body.model,
    );
  } catch { /* status is a nicety; the form still works without it */ }
}

$('#open-key').addEventListener('click', async () => {
  $('#setup').hidden = false;
  await refreshKeyStatus();
  $('#key-input').focus();
});

$('#key-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#key-input');
  const key = input.value.trim();
  if (!key) { setKeyStatus('Paste a key first.', 'error'); return; }

  const btn = $('#key-save');
  btn.disabled = true;
  setKeyStatus('Checking the key…', 'info');
  try {
    const res = await fetch('/api/key', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, save: $('#key-persist').checked }),
    });
    const body = await res.json();
    if (!res.ok || body.error) {
      setKeyStatus(body.error?.message ?? 'The key was rejected.', 'error');
      return;
    }
    input.value = '';
    setKeyStatus(body.message, 'ok');
    renderProviderPill('live', body.provider.label, body.model);
    toast(`Key saved · ${body.provider.label}`);
    setTimeout(() => { $('#setup').hidden = true; }, 900);
  } catch {
    setKeyStatus('Could not reach the server.', 'error');
  } finally {
    btn.disabled = false;
  }
});

$('#key-verify').addEventListener('click', async () => {
  setKeyStatus('Verifying…', 'info');
  const res = await fetch('/api/verify-key', { method: 'POST' });
  const body = await res.json();
  setKeyStatus(body.message, body.ok ? 'ok' : 'error');
});

$('#key-clear').addEventListener('click', async () => {
  // Losing the saved key means a restart, so make that a deliberate choice.
  const purge = window.confirm('Also delete the key from .env?\n\nChoose Cancel to forget it for this session only.');
  const url = purge ? '/api/key?purge=1' : '/api/key';
  const body = await (await fetch(url, { method: 'DELETE' })).json();
  setKeyStatus(body.removed ? 'Key removed from memory and .env.' : 'Key cleared for this session. The saved key in .env is untouched.', 'ok');
  await refreshKeyStatus();
  toast(body.removed ? 'Key deleted' : 'Key cleared for this session');
});

/* ------------------------------------------------------------------ toast */

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('is-visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => { el.hidden = true; }, 200);
  }, 2600);
}

/* ----------------------------------------------------------------- stages */

function renderStages(labels = {}) {
  const list = $('#stages');
  list.innerHTML = '';
  for (const id of STAGE_IDS) {
    const li = document.createElement('li');
    li.className = 'stage';
    li.id = `stage-${id}`;
    li.innerHTML = `<span class="stage__dot" aria-hidden="true"></span><span>${labels[id] ?? id}</span>`;
    list.append(li);
  }
}

function setStage(id, status, label) {
  const el = $(`#stage-${id}`);
  if (!el) return;
  el.classList.remove('is-active', 'is-done', 'is-failed');
  if (status) el.classList.add(`is-${status}`);
  if (label) el.lastElementChild.textContent = label;
}

function log(message, level = 'info', label = '') {
  const box = $('#log');
  const line = document.createElement('div');
  line.className = `log__line${level === 'info' ? '' : ` is-${level}`}`;
  line.innerHTML = label ? `<b>${escapeHtml(label)}</b><span>${escapeHtml(message)}</span>` : `<span>${escapeHtml(message)}</span>`;
  box.append(line);
  box.scrollTop = box.scrollHeight;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------------------------------------------------------- preview */

function setPreview(path) {
  if (!state.siteId) return;
  const frame = $('#preview-frame');
  const empty = $('#preview-empty');
  const iframe = $('#preview-iframe');
  empty.hidden = true;
  frame.hidden = false;
  iframe.dataset.width = $('.device.is-active')?.dataset.width ?? '1440';
  iframe.src = `/api/sites/${state.siteId}/raw/${path}?t=${Date.now()}`;
}

function fillRoutes(routes) {
  state.routes = routes.length ? routes : ['index.html'];
  const sel = $('#route-select');
  sel.innerHTML = '';
  for (const r of state.routes) {
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    sel.append(opt);
  }
  sel.value = state.routes.includes(state.route) ? state.route : state.routes[0];
  state.route = sel.value;
}

$('#route-select').addEventListener('change', (e) => {
  state.route = e.target.value;
  setPreview(state.route);
});
$('.device-toolbar').addEventListener('click', (e) => {
  const btn = e.target.closest('.device');
  if (!btn) return;
  $$('.device').forEach((b) => { b.classList.toggle('is-active', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
  $('#preview-iframe').dataset.width = btn.dataset.width;
});
$('#reload-preview').addEventListener('click', () => setPreview(state.route));
$('#open-tab').addEventListener('click', () => {
  if (!state.siteId) return;
  window.open(`/api/sites/${state.siteId}/raw/${state.route}`, '_blank', 'noopener');
});

/* ------------------------------------------------------------- generation */

function options() {
  const pages = $('#opt-pages').value.split(',').map((s) => s.trim()).filter(Boolean);
  const theme = $$('.segmented button').find((b) => b.getAttribute('aria-checked') === 'true')?.dataset.themeValue ?? 'auto';
  return {
    brandName: $('#opt-brand').value.trim() || null,
    pages,
    archetype: $('#opt-archetype').value || null,
    styleNotes: $('#opt-style').value.trim() || null,
    darkMode: theme === 'auto' ? null : theme === 'dark',
  };
}

$('.segmented').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  $$('.segmented button').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
});

$$('[data-example]').forEach((chip) => {
  chip.addEventListener('click', () => {
    $('#brief-input').value = chip.dataset.example;
    $('#brief-input').focus();
  });
});

$('#generate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.busy) return;
  const brief = $('#brief-input').value.trim();
  if (!brief) { toast('Write a brief first'); return; }

  resetRun();
  state.busy = true;
  $('#generate-btn').disabled = true;
  $('#cancel-btn').hidden = false;
  $('#generate-btn').textContent = 'Generating…';

  state.controller = new AbortController();
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief, options: options() }),
      signal: state.controller.signal,
    });
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
    }
    await consumeStream(res.body, handleEvent);
  } catch (err) {
    if (err.name === 'AbortError') log('Cancelled.', 'warn');
    else log(err.message, 'error');
    toast(err.name === 'AbortError' ? 'Cancelled' : err.message);
  } finally {
    state.busy = false;
    $('#generate-btn').disabled = false;
    $('#cancel-btn').hidden = true;
    $('#generate-btn').textContent = 'Generate site';
  }
});

$('#cancel-btn').addEventListener('click', () => state.controller?.abort());

function resetRun() {
  state.siteId = null;
  state.calls = 0;
  $('#log').innerHTML = '';
  $('#report').hidden = true;
  $('#deploy-result').hidden = true;
  $('#export-cluster').hidden = true;
  $('#open-tab').disabled = true;
  $('#edit-form').hidden = true;
  $('#token-counter').textContent = '0 calls';
  renderStages();
  for (const id of STAGE_IDS) setStage(id, null);
}

async function consumeStream(stream, onEvent) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      try {
        onEvent(JSON.parse(dataLine.slice(6)));
      } catch { /* partial frame */ }
    }
  }
}

function handleEvent(event) {
  switch (event.type) {
    case 'site': {
      state.siteId = event.siteId;
      if (Array.isArray(event.stages)) {
        const labels = Object.fromEntries(event.stages.map((s) => [s.id, s.label]));
        renderStages(labels);
      }
      setPreview('index.html');
      $('#open-tab').disabled = false;
      break;
    }
    case 'stage':
      if (event.status === 'active') setStage(event.id, 'active', event.label);
      else if (event.status === 'done') setStage(event.id, 'done', event.label);
      break;
    case 'log':
      log(event.message, event.level ?? 'info');
      break;
    case 'file':
      if (event.status === 'done') {
        setStage('pages', 'active');
        if (event.path.endsWith('.html')) {
          if (!state.routes.includes(event.path)) { state.routes.push(event.path); fillRoutes(state.routes); }
          setPreview(event.path === 'index.html' ? 'index.html' : event.path);
        }
      }
      break;
    case 'tokens':
      state.calls += 1;
      $('#token-counter').textContent = `${state.calls} call${state.calls === 1 ? '' : 's'} · ${formatTokens(event.usage?.totalTokenCount)} tokens`;
      break;
    case 'result':
      fillRoutes(event.routes ?? state.routes);
      setPreview(state.routes[0]);
      renderReport(event.report, event.usage, event.durationMs);
      $('#export-cluster').hidden = false;
      $('#edit-form').hidden = false;
      toast(event.degraded ? 'Generated with warnings' : 'Site ready');
      break;
    case 'error':
      log(event.message, 'error');
      toast(event.message);
      break;
    default:
      break;
  }
}

function formatTokens(n) {
  if (!n) return '0';
  if (n > 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function renderReport(report, usage, durationMs) {
  const box = $('#report');
  if (!report) { box.hidden = true; return; }
  const blocking = report.blocking ?? [];
  const warnings = report.warnings ?? [];
  const qa = report.qa ?? [];
  box.hidden = false;
  box.innerHTML = `
    <div class="report__summary">
      <span class="tag ${blocking.length ? 'tag--bad' : 'tag--ok'}">${blocking.length ? `${blocking.length} blocking` : 'clean'}</span>
      <span class="tag ${warnings.length ? 'tag--warn' : ''}">${warnings.length} warning${warnings.length === 1 ? '' : 's'}</span>
      <span class="tag">${qa.length} browser check${qa.length === 1 ? '' : 's'}</span>
      ${usage ? `<span class="tag">${usage.calls} calls · $${(usage.costUsd ?? 0).toFixed(4)}</span>` : ''}
      ${durationMs ? `<span class="tag">${(durationMs / 1000).toFixed(1)}s</span>` : ''}
    </div>
    <ul class="report__list">
      ${[...blocking, ...warnings].slice(0, 40).map((f) => `
        <li class="report__item">
          <span class="report__rule">${escapeHtml(f.file ? f.file.slice(0, 14) : f.rule)}</span>
          <span>${escapeHtml(f.rule)}: ${escapeHtml(f.message ?? '')}</span>
        </li>`).join('')}
    </ul>`;
}

/* ------------------------------------------------------------------- edit */

$('#edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.siteId || state.busy) return;
  const instruction = $('#edit-input').value.trim();
  if (!instruction) return;
  $('#edit-btn').disabled = true;
  $('#edit-btn').textContent = 'Applying…';
  try {
    const res = await fetch('/api/edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId: state.siteId, instruction }),
    });
    if (!res.ok || !res.body) throw new Error(`Edit failed (${res.status})`);
    await consumeStream(res.body, (event) => {
      if (event.type === 'log') log(event.message, event.level ?? 'info');
      if (event.type === 'result') {
        log(event.summary, 'ok');
        setPreview(state.route);
        renderReport(event.report);
        $('#edit-input').value = '';
        toast('Change applied');
      }
      if (event.type === 'error') { log(event.message, 'error'); toast(event.message); }
    });
  } catch (err) {
    log(err.message, 'error');
  } finally {
    $('#edit-btn').disabled = false;
    $('#edit-btn').textContent = 'Apply';
  }
});

/* ----------------------------------------------------------------- export */

$('#btn-zip').addEventListener('click', () => {
  if (state.siteId) window.location.href = `/api/sites/${state.siteId}/bundle`;
});
$('#btn-single').addEventListener('click', () => {
  if (state.siteId) window.location.href = `/api/sites/${state.siteId}/single?page=${encodeURIComponent(state.route)}`;
});

$('#btn-deploy').addEventListener('click', async () => {
  if (!state.siteId) return;
  const box = $('#deploy-result');
  box.hidden = false;
  box.innerHTML = '<p class="muted">Deploying…</p>';
  try {
    const res = await fetch(`/api/sites/${state.siteId}/deploy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await res.json();
    if (body.ok) {
      box.innerHTML = `<p><span class="tag tag--ok">live</span></p><p><a href="${escapeHtml(body.url)}" target="_blank" rel="noopener">${escapeHtml(body.url)}</a></p><p class="muted">${escapeHtml(body.provider)} · ${escapeHtml(body.adapter ?? '')}</p>`;
      toast('Deployed');
      return;
    }
    box.innerHTML = `
      <p><span class="tag tag--warn">${escapeHtml(body.reason ?? 'not deployed')}</span></p>
      <p class="muted">${escapeHtml(body.message ?? '')}</p>
      ${body.missing ? `<p class="muted">Missing: ${body.missing.map(escapeHtml).join(', ')}</p>` : ''}
      ${body.instructions ? `<pre>${escapeHtml(body.instructions)}</pre>` : ''}`;
  } catch (err) {
    box.innerHTML = `<p class="muted">${escapeHtml(err.message)}</p>`;
  }
});

/* ------------------------------------------------------------------- boot */

initTheme();
initHealth();
renderStages();
