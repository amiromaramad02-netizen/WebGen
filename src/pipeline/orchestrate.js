import config from '../config.js';
import { log } from '../util/logger.js';
import { correlationId, shortHash } from '../util/id.js';
import { slugify } from '../util/text.js';
import { listFilesRecursive, readTextIfExists } from '../util/fsx.js';
import { resolveInRoot, safeRelativePath } from '../util/paths.js';

import { gemini, GeminiError, TruncatedResponseError } from '../gemini/client.js';
import { SCHEMAS } from '../gemini/schema.js';
import { MASTER_SYSTEM } from '../gemini/prompts/system.js';
import { analyzePrompt, planPrompt, designPrompt } from '../gemini/prompts/architect.js';
import { stylesPrompt, scriptPrompt, pagePrompt, assetPrompt, editPrompt } from '../gemini/prompts/pages.js';
import { repairPrompt, qaRepairPrompt, seoRepairPrompt } from '../gemini/prompts/repair.js';
import { selectSkills } from '../design/skills.js';
import { buildDesignContext } from '../design/tokens.js';
import { emitFile, buildSite } from './emit.js';
import { validateFileSet } from './validate.js';
import { repairFile } from './repair.js';
import { runQa } from './screenshot.js';

export const STAGES = [
  { id: 'analyze', label: 'Understanding the brief' },
  { id: 'plan', label: 'Planning pages and files' },
  { id: 'design-system', label: 'Locking the design system' },
  { id: 'pages', label: 'Writing the site' },
  { id: 'validate', label: 'Validating structure' },
  { id: 'repair', label: 'Repairing what failed' },
  { id: 'screenshot', label: 'Browser QA' },
  { id: 'bundle', label: 'Packaging' },
];

/* --------------------------------------------------------------- utilities */

function makeEmitter(sink) {
  return (type, payload) => {
    try {
      sink({ type, ...payload, at: Date.now() });
    } catch {
      /* a dead SSE client must never break generation */
    }
  };
}

function inferBriefFields(brief, options = {}) {
  const text = `${brief} ${options.styleNotes ?? ''} ${options.brandName ?? ''}`;
  const lower = text.toLowerCase();
  const pageType =
    options.pageType ??
    (/dashboard|admin|analytics/.test(lower) ? 'saas-app'
      : /portfolio|resume|personal/.test(lower) ? 'portfolio'
        : /docs|documentation/.test(lower) ? 'docs'
          : /store|shop|ecommerce|product/.test(lower) ? 'ecommerce'
            : /event|conference|webinar/.test(lower) ? 'event'
              : /restaurant|menu/.test(lower) ? 'restaurant'
                : /blog|magazine/.test(lower) ? 'blog'
                  : options.pages?.length > 1 ? 'multipage' : 'landing');
  const requested = Array.isArray(options.pages) ? options.pages.filter(Boolean) : [];
  const pages = requested.length
    ? requested.map((p) => (String(p).endsWith('.html') ? String(p) : `${slugify(p)}.html`)).filter((p) => p !== '')
    : null;
  return {
    pageType,
    pages: pages && pages[0] === 'index.html' ? pages : pages ? ['index.html', ...pages.filter((p) => p !== 'index.html')] : null,
    dark: options.darkMode === true ? 'dark' : options.darkMode === false ? 'light' : 'auto',
    include: Array.isArray(options.include) ? options.include : ['contact', 'seo'],
    analyticsId: /^UA-\d{4,10}-\d{1,4}$|^G-[A-Z0-9]{4,}$/.test(options.analyticsId ?? '') ? options.analyticsId : null,
  };
}

function planFileList(plan) {
  return (plan?.files ?? []).map((f) => f.path);
}

/** Guarantees the shared css/js and the seo files exist even if the model skipped them. */
function requiredPaths(plan) {
  const listed = new Set(planFileList(plan));
  const pages = (plan?.pages ?? []).map((p) => p.path);
  const out = [];
  if (!listed.has('index.html')) out.push('index.html');
  for (const p of pages) if (!listed.has(p)) out.push(p);
  if (!listed.has('styles.css')) out.push('styles.css');
  if (!listed.has('app.js')) out.push('app.js');
  if (!listed.has('favicon.svg')) out.push('favicon.svg');
  for (const f of ['robots.txt', 'sitemap.xml', 'site.webmanifest']) if (!listed.has(f)) out.push(f);
  return [...new Set(out)];
}

function kindOf(plan, path) {
  return planFileList(plan).includes(path)
    ? (plan.files.find((f) => f.path === path)?.kind ?? inferKind(path))
    : inferKind(path);
}

function inferKind(path) {
  if (path.endsWith('.html')) return 'page';
  if (path.endsWith('.css')) return 'style';
  if (path.endsWith('.js')) return 'script';
  if (path.endsWith('.txt') || path.endsWith('.xml')) return 'seo';
  if (path.endsWith('.webmanifest') || path.endsWith('.json')) return 'meta';
  return 'asset';
}

function extractFiles(data) {
  if (!data || typeof data !== 'object') return [];
  const list = Array.isArray(data.files) ? data.files : [];
  return list
    .filter((f) => f && typeof f.path === 'string' && typeof f.content === 'string')
    .map((f) => ({ path: f.path, content: f.content }));
}

/* ---------------------------------------------------------------- generate */

/**
 * Runs the full pipeline for one brief, emitting SSE-shaped events.
 * @param {object} args
 * @param {string} args.brief
 * @param {object} args.options
 * @param {(event: object) => void} args.emit
 * @param {object} args.client  injectable Gemini client (tests use a mock)
 */
export async function generateSite({ brief, options = {}, emit, client = gemini, siteDir }) {
  const cid = correlationId();
  const say = makeEmitter(emit);
  const started = Date.now();
  const clientUsageStart = { ...client.usage };
  const calls = [];

  say('stage', { id: 'analyze', label: STAGES[0].label, status: 'active' });

  const analysis = await callJson(client, {
    label: 'analyze',
    systemInstruction: MASTER_SYSTEM,
    prompt: analyzePrompt(brief, options),
    schema: undefined,
    temperature: 0.7,
    maxOutputTokens: 4000,
  }, say, calls);

  const inferred = inferBriefFields(brief, options);
  const triage = mergeTriage(analysis, inferred, options);

  say('log', { message: `Detected ${triage.pageType} site for ${triage.industry}; archetype ${triage.archetype}.` });

  /* ---- plan ---- */
  say('stage', { id: 'analyze', status: 'done' });
  say('stage', { id: 'plan', label: STAGES[1].label, status: 'active' });
  const planRaw = await callJson(client, {
    label: 'plan',
    systemInstruction: MASTER_SYSTEM,
    prompt: planPrompt(brief, options, triage),
    schema: SCHEMAS.plan,
    temperature: 0.7,
    maxOutputTokens: config.gemini.maxTokens.plan,
  }, say, calls);
  const plan = normalisePlan(planRaw, brief, triage, inferred);

  if (plan.pages.length + plan.files.length > config.limits.filesMaxPerSite) {
    plan.files = plan.files.slice(0, config.limits.filesMaxPerSite);
  }
  // Every planned file gets written: pages, the shared css/js, the assets and the
  // seo files. requiredPaths() only backfills what the model forgot.
  const targets = [...new Set([
    ...plan.pages.map((p) => p.path),
    ...plan.files.map((f) => f.path),
    ...requiredPaths(plan),
  ])].filter((t) => t && safeRelativePath(t));

  say('log', {
    message: `${plan.pages.length} page(s), ${plan.files.length} files: ${targets.slice(0, 8).join(', ')}${targets.length > 8 ? '…' : ''}`,
  });
  say('stage', { id: 'plan', status: 'done' });

  /* ---- design system ---- */
  say('stage', { id: 'design-system', label: STAGES[2].label, status: 'active' });
  const designRaw = await callJson(client, {
    label: 'design',
    systemInstruction: MASTER_SYSTEM,
    prompt: designPrompt(brief, plan, triage, options),
    schema: SCHEMAS.design,
    temperature: 0.9,
    maxOutputTokens: config.gemini.maxTokens.design,
  }, say, calls);

  const { skills } = selectSkills({
    archetype: triage.archetype,
    brief: `${brief} ${options.styleNotes ?? ''}`,
    pageCount: plan.pages.length,
  });
  const designCtx = buildDesignContext(designRaw, skills);
  say('log', {
    message: `${skills.length} design skills applied (${designCtx.tokens.archetype}); contrast audit ${designCtx.audit.pass ? 'passed' : 'repaired'}.`,
    detail: { skills, audit: designCtx.audit.results.filter((r) => !r.pass) },
  });
  say('stage', { id: 'design-system', status: 'done' });

  /* ---- write files ---- */
  say('stage', { id: 'pages', label: STAGES[3].label, status: 'active' });
  const fileList = plan.files.map((f) => ({ path: f.path, kind: f.kind, page: f.page, description: f.description }));
  const written = [];
  const failures = [];

  for (const [i, target] of targets.entries()) {
    const kind = kindOf(plan, target);
    const pageIndex = plan.pages.findIndex((p) => p.path === target);
    const fileMeta = { path: target, kind, page: pageIndex >= 0 ? plan.pages[pageIndex].path : 'shared', description: plan.files.find((f) => f.path === target)?.description ?? describeKind(kind, target) };
    say('file', { status: 'start', path: target, kind, index: i, total: targets.length });

    const built = await writeOneFile({
      client, say, calls, brief, options, plan, triage, designCtx, fileList, target, fileMeta, pageIndex, siteDir,
    });

    if (built.ok) {
      written.push(built);
      say('file', { status: 'done', path: target, bytes: built.bytes });
      say('preview-ready', { path: target });
    } else {
      failures.push({ path: target, reason: built.reason, error: built.error });
      say('file', { status: 'failed', path: target, error: built.error ?? built.reason });
      say('log', { level: 'error', message: `${target} failed: ${built.error ?? built.reason}` });
    }
  }
  say('stage', { id: 'pages', status: 'done' });

  /* ---- validate ---- */
  say('stage', { id: 'validate', label: STAGES[4].label, status: 'active' });
  await buildSite(siteDir);
  const report = await runValidation({ plan, say, siteDir });
  say('stage', { id: 'validate', status: 'done' });

  /* ---- repair ---- */
  say('stage', { id: 'repair', label: STAGES[5].label, status: 'active' });
  const repairOutcome = await runRepairPass({ client, say, calls, brief, options, plan, triage, designCtx, skills, report, siteDir, cid });
  say('stage', { id: 'repair', status: 'done', detail: repairOutcome.summary });

  /* ---- final validate after repair ---- */
  const finalReport = await runValidation({ plan, say, siteDir, quiet: true });
  await buildSite(siteDir);

  /* ---- browser QA ---- */
  say('stage', { id: 'screenshot', label: STAGES[6].label, status: 'active' });
  const qa = await runQa({ plan, say, siteDir });
  if (qa.repairable.length) {
    say('log', { level: 'warn', message: `Browser QA found ${qa.repairable.length} issue(s); attempting a second repair pass.` });
    const qaRepair = await runRepairPass({
      client, say, calls, brief, options, plan, triage, designCtx, skills, siteDir,
      report: { byPath: groupFailures(qa.repairable) }, qaOnly: true, maxAttempts: 1, cid,
    });
    say('log', { message: `QA repair: ${qaRepair.summary}` });
    await buildSite(siteDir);
  }
  const postQa = await runQa({ plan, say, siteDir, quick: true });
  say('stage', { id: 'screenshot', status: 'done', detail: { checks: postQa.checks.length } });

  /* ---- bundle ---- */
  say('stage', { id: 'bundle', label: STAGES[7].label, status: 'active' });
  const files = await listFilesRecursive(siteDir);
  say('stage', { id: 'bundle', status: 'done' });

  const usageDelta = {
    promptTokens: client.usage.promptTokens - clientUsageStart.promptTokens,
    candidatesTokens: client.usage.candidatesTokens - clientUsageStart.candidatesTokens,
    totalTokens: client.usage.totalTokens - clientUsageStart.totalTokens,
    calls: client.usage.calls - clientUsageStart.calls,
    costUsd: Math.round((client.usage.costUsd - clientUsageStart.costUsd) * 10000) / 10000,
  };

  const combined = mergeReports(finalReport, { ...qa, failures: [...qa.failures, ...postQa.failures] }, repairOutcome);
  const degraded = combined.blocking.length > 0;

  return {
    correlationId: cid,
    brief,
    options,
    analysis: triage,
    plan,
    design: designCtx.tokens,
    designCssVars: designCtx.cssVars,
    skills,
    fileList: files,
    routes: plan.pages.map((p) => p.path),
    report: combined,
    degraded,
    failures,
    usage: usageDelta,
    model: client.resolveMode ? client.resolveMode() : 'unknown',
    durationMs: Date.now() - started,
    fingerprint: shortHash(`${brief}|${JSON.stringify(options)}|${plan.pages.map((p) => p.path).join(',')}`, 12),
  };
}

/* ------------------------------------------------------------------ pieces */

async function callJson(client, { label, systemInstruction, prompt, schema, temperature, maxOutputTokens }, say, calls) {
  say('log', { message: `Calling model: ${label}…` });
  let res;
  try {
    if (schema) {
      res = await client.generateJson({
        systemInstruction, prompt, schema, temperature, maxOutputTokens, label,
      });
    } else {
      res = await client.generate({ systemInstruction, prompt, config: { temperature, maxOutputTokens }, label });
      const parsed = tryParse(res.text);
      res.data = parsed ?? {};
    }
  } catch (err) {
    if (err instanceof TruncatedResponseError) {
      say('log', { level: 'warn', message: `${label} hit the token ceiling; retrying with a tighter instruction.` });
      res = await retryShorter(client, { label, systemInstruction, prompt, schema, temperature, maxOutputTokens, say });
    } else {
      const message = err instanceof GeminiError ? err.message : String(err?.message ?? err);
      say('log', { level: 'error', message: `${label} failed: ${message}` });
      throw err;
    }
  }
  calls.push({ label, model: res.model, usage: res.usage, bytes: res.text.length });
  say('tokens', { label, usage: res.usage });
  return res.data;
}

async function retryShorter(client, { label, systemInstruction, prompt, schema, temperature, maxOutputTokens, say }) {
  const tighter = `${prompt}\n\nIMPORTANT: your previous response was cut off. Be terse. Do not restate context. Produce the JSON and nothing else.`;
  if (schema) {
    return client.generateJson({
      systemInstruction, prompt: tighter, schema, temperature, maxOutputTokens, label: `${label}-retry`,
    });
  }
  const res = await client.generate({ systemInstruction, prompt: tighter, config: { temperature, maxOutputTokens }, label: `${label}-retry` });
  res.data = tryParse(res.text) ?? {};
  return res;
}

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first === -1 || last <= first) return null;
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {
      return null;
    }
  }
}

function mergeTriage(analysis, inferred, options) {
  const a = analysis && typeof analysis === 'object' ? analysis : {};
  const archetype = typeof a.archetype === 'string' ? a.archetype : 'landing-conversion';
  return {
    pageType: a.pageType ?? inferred.pageType,
    industry: a.industry ?? 'services',
    brandName: options.brandName ?? a.brandName ?? 'Studio',
    mood: a.mood ?? 'warm, confident, human',
    archetype,
    audience: a.audience ?? 'busy people who want a better outcome',
    valueProp: a.valueProp ?? 'A better result this quarter.',
    mustHaveSections: Array.isArray(a.mustHaveSections) && a.mustHaveSections.length ? a.mustHaveSections : ['hero', 'features', 'testimonials', 'faq', 'cta-band'],
    pages: inferred.pages ?? (Array.isArray(a.pages) && a.pages.length ? a.pages : ['index.html']),
    callouts: Array.isArray(a.callouts) ? a.callouts : [],
    risks: Array.isArray(a.risks) ? a.risks : [],
    darkMode: inferred.dark,
    include: inferred.include,
    analyticsId: inferred.analyticsId,
  };
}

function normalisePlan(raw, brief, triage, inferred) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const pages = (Array.isArray(r.pages) && r.pages.length ? r.pages : [{ path: 'index.html', title: triage.brandName }])
    .map((p) => ({
      path: String(p?.path ?? 'index.html').replace(/^\.?\//, ''),
      title: String(p?.title ?? triage.brandName).slice(0, 70),
      purpose: String(p?.purpose ?? ''),
      sections: Array.isArray(p?.sections) ? p.sections.filter((s) => typeof s === 'string') : ['hero', 'features', 'cta-band'],
      primaryCta: p?.primaryCta ?? 'Get started',
    }))
    .filter((p) => p.path.endsWith('.html'));

  if (!pages.some((p) => p.path === 'index.html')) {
    pages.unshift({ path: 'index.html', title: triage.brandName, purpose: 'Home', sections: triage.mustHaveSections, primaryCta: 'Get started' });
  }

  const seen = new Set();
  const deduped = pages.filter((p) => (seen.has(p.path) ? false : (seen.add(p.path), true)));

  // A separate set from `seen`: a page listed in `files` must keep its metadata,
  // otherwise every page loses its description and section brief.
  const seenFiles = new Set();
  const files = (Array.isArray(r.files) ? r.files : [])
    .map((f) => ({
      path: String(f?.path ?? '').replace(/^\.?\//, ''),
      kind: f?.kind ?? inferKind(String(f?.path ?? '')),
      page: f?.page ?? 'shared',
      description: String(f?.description ?? ''),
    }))
    .filter((f) => f.path && !seenFiles.has(f.path) && seenFiles.add(f.path));

  // Pages the model forgot to describe still need a file entry.
  for (const page of deduped) {
    if (!files.some((f) => f.path === page.path)) {
      files.unshift({ path: page.path, kind: 'page', page: page.path, description: page.purpose || `The ${page.title} page.` });
    }
  }

  const brand = r.brandName ?? triage.brandName;
  const seo = {
    metaDescription: r.seo?.metaDescription ?? `${brand} — built for ${triage.audience}.`,
    keywords: Array.isArray(r.seo?.keywords) ? r.seo.keywords : [],
    ogTitle: r.seo?.ogTitle ?? brand,
    ogDescription: r.seo?.ogDescription ?? r.seo?.metaDescription ?? '',
    jsonLdType: r.seo?.jsonLdType ?? 'Organization',
  };

  return {
    brandName: brand,
    tagline: r.tagline ?? brand,
    summary: r.summary ?? '',
    audience: triage.audience,
    toneOfVoice: r.toneOfVoice ?? triage.mood,
    pages: deduped,
    files,
    sections: Array.isArray(r.sections) ? r.sections : [],
    seo,
    accessibilityNotes: Array.isArray(r.accessibilityNotes) ? r.accessibilityNotes : [],
    include: inferred.include,
    darkMode: inferred.dark,
  };
}

function describeKind(kind, path) {
  switch (kind) {
    case 'style':
      return 'The one shared stylesheet: tokens, reset, typography, layout, components, dark mode, reduced motion.';
    case 'script':
      return 'The one shared script: nav, drawer, reveal, counters, forms, tabs, modal, theme, back-to-top.';
    case 'seo':
      return path.endsWith('.xml') ? 'A sitemap with one entry per page.' : 'robots.txt allowing everything and pointing at the sitemap.';
    case 'meta':
      return 'A web manifest with real theme and background colours.';
    default:
      return 'A page of the site.';
  }
}

async function writeOneFile({ client, say, calls, brief, options, plan, triage, designCtx, fileList, target, fileMeta, pageIndex, siteDir }) {
  const kind = fileMeta.kind;
  const base = { systemInstruction: MASTER_SYSTEM, label: `write:${target}`, temperature: kind === 'style' || kind === 'script' ? 0.35 : 0.4 };

  let prompt;
  if (kind === 'style') {
    prompt = stylesPrompt({ brief, plan, design: designCtx.tokens, analysis: triage, skills: designCtx.skills });
  } else if (kind === 'script') {
    prompt = scriptPrompt({ brief, plan, design: designCtx.tokens, analysis: triage, fileList: fileList.map((f) => f.path) });
  } else if (kind === 'page') {
    prompt = pagePrompt({
      brief, plan, design: designCtx.tokens, analysis: triage, skills: designCtx.skills,
      target: fileMeta, fileList: fileList.map((f) => f.path), pageIndex,
    });
  } else {
    prompt = assetPrompt({ brief, plan, design: designCtx.tokens, target: fileMeta });
  }

  let data;
  try {
    data = await callJson(client, {
      ...base,
      prompt,
      schema: SCHEMAS.page,
      maxOutputTokens: config.gemini.maxTokens.page,
    }, say, calls);
  } catch (err) {
    // A non-Gemini error here is a bug in our own prompt/mock/schema layer, not a
    // model failure. Never dress it up as one: it would be silently skipped.
    const reason = err instanceof GeminiError ? 'model-error' : 'generator-error';
    if (err instanceof TruncatedResponseError) {
      try {
        data = await callJson(client, {
          ...base,
          prompt: `${prompt}\n\nIMPORTANT: keep the file tight. Cut any optional flourish. Output the JSON only.`,
          schema: SCHEMAS.page,
          maxOutputTokens: config.gemini.maxTokens.page,
        }, say, calls);
      } catch (err2) {
        return { ok: false, reason, error: String(err2?.message ?? err2) };
      }
    } else {
      return { ok: false, reason, error: String(err?.message ?? err) };
    }
  }

  const files = extractFiles(data).filter((f) => f.path === target || f.path.endsWith(target));
  const chosen = files.find((f) => f.path === target) ?? files[0];
  if (!chosen) return { ok: false, reason: 'empty-response' };
  if (typeof chosen.content !== 'string' || !chosen.content.trim()) {
    return { ok: false, reason: 'empty-response', error: `model returned no content for ${target}` };
  }

  const res = await emitFile(siteDir, chosen.path, chosen.content);
  if (!res.ok) return { ok: false, reason: res.reason, bytes: res.bytes };
  return { ok: true, path: res.path, bytes: res.bytes };
}

async function runValidation({ plan, say, siteDir, quiet = false }) {
  const dir = siteDir;
  const files = {};
  for (const rel of await listFilesRecursive(dir)) {
    if (rel.startsWith('.')) continue;
    const abs = resolveInRoot(dir, rel);
    if (!abs) continue;
    const text = await readTextIfExists(abs);
    if (text !== null) files[rel] = text;
  }
  const result = validateFileSet(files);
  if (!quiet) {
    const blocking = result.failures.filter((f) => (f.severity ?? 'error') === 'error');
    say('log', {
      level: blocking.length ? 'warn' : 'info',
      message: blocking.length
        ? `${blocking.length} blocking issue(s), ${result.failures.length - blocking.length} warning(s).`
        : `Structure clean: ${result.failures.length} warning(s).`,
    });
  }
  return { pass: result.pass, failures: result.failures, byPath: result.byPath, fileCount: Object.keys(files).length };
}

function groupFailures(failures) {
  const byPath = new Map();
  for (const f of failures) {
    const p = f.file ?? 'index.html';
    if (!byPath.has(p)) byPath.set(p, []);
    byPath.get(p).push(f);
  }
  return byPath;
}

async function runRepairPass({ client, say, calls, brief, options, plan, triage, designCtx, skills, report, siteDir, qaOnly = false, maxAttempts = config.limits.repairMaxAttempts, cid }) {
  const summary = { files: 0, attempts: 0, remaining: 0, unrepairable: [] };
  const byPath = report?.byPath ?? new Map();
  const candidates = [...byPath.entries()]
    .filter(([, failures]) => failures.some((f) => (f.severity ?? 'error') === 'error'))
    .map(([p]) => p);
  const qaCandidates = qaOnly ? [...byPath.keys()] : [];
  const targets = qaOnly ? qaCandidates : candidates;

  if (!targets.length) {
    say('log', { message: 'Nothing to repair.' });
    return summary;
  }

  for (const target of targets.slice(0, 12)) {
    const abs = resolveInRoot(siteDir, target);
    if (!abs) continue;
    const content = await readTextIfExists(abs);
    if (content === null) continue;
    const failures = byPath.get(target) ?? [];
    const result = await repairFile({
      client, brief, plan, design: designCtx.tokens, skills, target: { path: target, kind: kindOf(plan, target) },
      content, failures, qaOnly, maxAttempts, cid, say, calls, onFiles: async (files) => {
        for (const f of files) await emitFile(siteDir, f.path, f.content);
      },
    });
    summary.attempts += result.attempts;
    summary.files += result.files.length;
    if (!result.pass) summary.unrepairable.push({ path: target, remaining: result.remaining });
  }

  const stillFailing = await runValidation({ plan, say, siteDir, quiet: true });
  summary.remaining = stillFailing.failures.filter((f) => (f.severity ?? 'error') === 'error').length;
  await ensureSeoFiles({ client, say, calls, plan, siteDir });
  return summary;
}

/** Guarantees robots/sitemap/manifest exist and parse, whatever the model did. */
async function ensureSeoFiles({ client, say, calls, plan, siteDir }) {
  const dir = siteDir;
  const wanted = ['robots.txt', 'sitemap.xml', 'site.webmanifest'];
  const files = {};
  for (const p of wanted) {
    const abs = resolveInRoot(dir, p);
    const text = abs ? await readTextIfExists(abs) : null;
    if (text === null) files[p] = null;
    else {
      const result = validateSeoQuick(p, text);
      if (result.length) files[p] = result;
    }
  }
  const missing = wanted.filter((p) => files[p] === null);
  const broken = wanted.filter((p) => Array.isArray(files[p]) && files[p].length);
  if (!missing.length && !broken.length) return;

  say('log', { level: 'warn', message: `Repairing SEO files: ${[...missing, ...broken].join(', ')}` });
  const data = await callJson(client, {
    label: 'seo-repair',
    systemInstruction: MASTER_SYSTEM,
    prompt: seoRepairPrompt({ plan, pages: plan.pages, currentFiles: [...missing, ...broken] }),
    schema: SCHEMAS.page,
    temperature: 0.2,
    maxOutputTokens: 6000,
  }, say, calls);

  const provided = extractFiles(data);
  const defaults = {
    'robots.txt': () => `User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n`,
    'sitemap.xml': () => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${plan.pages
      .map((p) => `  <url><loc>https://example.com/${p.path}</loc><changefreq>monthly</changefreq></url>`)
      .join('\n')}\n</urlset>\n`,
    'site.webmanifest': () => JSON.stringify({
      name: plan.brandName, short_name: plan.brandName.slice(0, 12), start_url: 'index.html', display: 'standalone',
    }, null, 2),
  };
  for (const p of [...missing, ...broken]) {
    const fromModel = provided.find((f) => f.path === p);
    const content = fromModel?.content ?? defaults[p]();
    const check = validateSeoQuick(p, content);
    await emitFile(dir, p, check.length ? defaults[p]() : content);
  }
}

function validateSeoQuick(path, text) {
  if (path.endsWith('.webmanifest')) {
    try {
      JSON.parse(text);
      return [];
    } catch {
      return ['invalid JSON'];
    }
  }
  if (path.endsWith('.xml')) {
    return /<urlset/i.test(text) && /<loc>/i.test(text) ? [] : ['missing urlset or loc'];
  }
  return /user-agent/i.test(text) ? [] : ['missing user-agent'];
}

function mergeReports(finalReport, qa, repairOutcome) {
  const blocking = finalReport.failures.filter((f) => (f.severity ?? 'error') === 'error');
  const warnings = finalReport.failures.filter((f) => (f.severity ?? 'error') === 'warning');
  const qaBlocking = (qa.failures ?? []).filter((f) => (f.severity ?? 'error') === 'error');
  return {
    pass: blocking.length === 0 && qaBlocking.length === 0,
    blocking: [...blocking, ...qaBlocking],
    warnings,
    qa: qa.checks ?? [],
    lighthouse: qa.lighthouse ?? null,
    repair: repairOutcome,
    total: finalReport.failures.length,
  };
}

/* -------------------------------------------------------------------- edit */

export async function applyEdit({ siteId, instruction, emit, client = gemini }) {
  const say = makeEmitter(emit);
  const { store } = await import('../store.js');
  const record = store.get(siteId);
  if (!record) {
    const err = new Error('Site not found or expired.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const { skills } = selectSkills({ archetype: record.analysis?.archetype, brief: record.brief, pageCount: record.plan?.pages?.length ?? 1 });
  const designCtx = buildDesignContext(record.design, skills);

  say('stage', { id: 'edit', label: 'Reading the site', status: 'active' });
  const currentFiles = [];
  for (const rel of await listFilesRecursive(record.dir)) {
    if (rel.startsWith('.')) continue;
    const abs = resolveInRoot(record.dir, rel);
    if (!abs) continue;
    const text = await readTextIfExists(abs);
    if (text === null) continue;
    currentFiles.push({ path: rel, content: text, bytes: text.length });
  }
  const toSend = currentFiles
    .filter((f) => f.path.endsWith('.html') || /^(styles|app)\.(css|js)$/.test(f.path))
    .slice(0, 14);

  const data = await client.generateJson({
    systemInstruction: MASTER_SYSTEM,
    prompt: editPrompt({
      brief: record.brief, plan: record.plan, design: designCtx.tokens, skills,
      instruction, fileList: currentFiles.map((f) => ({ path: f.path, bytes: f.bytes })), currentFiles: toSend,
    }),
    schema: SCHEMAS.edit,
    temperature: 0.4,
    maxOutputTokens: config.gemini.maxTokens.edit,
    label: 'edit',
  });

  const changes = [...(Array.isArray(data.changes) ? data.changes : []), ...(Array.isArray(data.assets) ? data.assets : [])]
    .filter((c) => c && typeof c.path === 'string' && typeof c.content === 'string');

  const known = new Set(currentFiles.map((f) => f.path));
  const applied = [];
  const rejected = [];
  for (const change of changes) {
    if (!known.has(change.path)) {
      rejected.push({ path: change.path, reason: 'not-an-existing-file' });
      continue;
    }
    const res = await emitFile(record.dir, change.path, change.content);
    if (res.ok) {
      applied.push(res.path);
      say('file', { status: 'done', path: res.path, bytes: res.bytes });
      say('preview-ready', { path: res.path });
    } else {
      rejected.push({ path: change.path, reason: res.reason });
    }
  }

  say('stage', { id: 'edit', status: 'done' });

  // An edit that lands a change is only shipped if it still passes the gate.
  const report = await runValidation({ plan: record.plan, say, siteDir: record.dir, quiet: true });
  let repairOutcome = { files: 0, attempts: 0, remaining: report.failures.filter((f) => f.severity === 'error').length, unrepairable: [] };
  if (repairOutcome.remaining > 0 && applied.length) {
    repairOutcome = await runRepairPass({
      client, say, calls: [], brief: record.brief, options: record.options, plan: record.plan,
      triage: record.analysis, designCtx, skills, report, siteDir: record.dir, cid: record.id,
    });
  }
  await buildSite(record.dir);

  await store.update(siteId, {
    files: await listFilesRecursive(record.dir),
    report: {
      pass: repairOutcome.remaining === 0,
      blocking: report.failures.filter((f) => f.severity === 'error'),
      warnings: report.failures.filter((f) => f.severity === 'warning'),
      repair: repairOutcome,
    },
  });

  return {
    siteId,
    summary: data.summary ?? 'Applied the requested change.',
    applied,
    rejected,
    report: {
      pass: repairOutcome.remaining === 0,
      blocking: report.failures.filter((f) => f.severity === 'error'),
      warnings: report.failures.filter((f) => f.severity === 'warning'),
    },
  };
}
