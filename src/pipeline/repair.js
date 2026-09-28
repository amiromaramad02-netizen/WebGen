import config from '../config.js';
import { log } from '../util/logger.js';
import { SCHEMAS } from '../gemini/schema.js';
import { MASTER_SYSTEM } from '../gemini/prompts/system.js';
import { repairPrompt, qaRepairPrompt } from '../gemini/prompts/repair.js';
import {
  validateHtml, validateCss, validateJs, validateSvg, validateSeoText, validateJsonText,
} from './validate.js';

/** Reruns the static gate for one file so a repair is judged on evidence. */
async function revalidate(filePath, content) {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  switch (ext) {
    case '.html':
      return validateHtml(content, { files: null, path: filePath });
    case '.css':
      return validateCss(content, { path: filePath });
    case '.js':
      return validateJs(content, { path: filePath });
    case '.svg':
      return validateSvg(content, { path: filePath });
    case '.json':
    case '.webmanifest':
      return validateJsonText(content, { path: filePath });
    case '.xml':
    case '.txt':
      return validateSeoText(content, { path: filePath });
    default:
      return [];
  }
}

function blocking(failures) {
  return (failures ?? []).filter((f) => (f.severity ?? 'error') === 'error');
}

/**
 * Repairs a single file, re-validating after each attempt.
 * Only writes when the attempt actually reduced the blocking count — a repair
 * that makes things worse is discarded.
 */
export async function repairFile({
  client, brief, plan, design, skills, target, content, failures, qaOnly = false,
  maxAttempts = config.limits.repairMaxAttempts, cid, say, calls, onFiles,
}) {
  const out = { path: target.path, attempts: 0, files: [], pass: false, remaining: 0, history: [] };
  let current = content;
  let currentFailures = failures ?? [];
  let best = blocking(currentFailures).length;
  const initial = best;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (best === 0) break;
    out.attempts = attempt;
    say?.('log', {
      message: `Repairing ${target.path} (attempt ${attempt}/${maxAttempts}, ${best} issue${best === 1 ? '' : 's'}).`,
    });

    let data;
    try {
      const prompt = qaOnly
        ? qaRepairPrompt({ plan, design, skills, target, content: current, qa: currentFailures, attempt, maxAttempts })
        : repairPrompt({ plan, design, skills, target, content: current, failures: currentFailures, attempt, maxAttempts });
      const res = await client.generateJson({
        systemInstruction: MASTER_SYSTEM,
        prompt,
        schema: SCHEMAS.repair,
        temperature: 0.2,
        maxOutputTokens: config.gemini.maxTokens.repair,
        label: `repair:${target.path}#${attempt}`,
      });
      data = res.data;
      calls?.push({ label: `repair:${target.path}`, model: res.model, usage: res.usage, bytes: res.text.length });
    } catch (err) {
      log.warn(`repair ${target.path} attempt ${attempt} failed:`, err.message);
      out.history.push({ attempt, error: err.message });
      continue;
    }

    const files = (Array.isArray(data?.files) ? data.files : [])
      .filter((f) => f && typeof f.content === 'string' && (f.path === target.path || !f.path))
      .map((f) => ({ path: f.path ?? target.path, content: f.content }));

    if (!files.length) {
      out.history.push({ attempt, note: 'model returned no file' });
      continue;
    }

    // Re-validate exactly what the model claims to have produced.
    let worst = 0;
    const combined = [];
    for (const f of files) {
      const again = await revalidate(f.path, f.content, onFiles);
      worst = Math.max(worst, blocking(again).length);
      combined.push(...again.map((x) => ({ ...x, file: f.path })));
    }

    out.history.push({ attempt, fixes: data?.fixesApplied ?? [], remaining: worst });

    if (worst <= best) {
      best = worst;
      current = files[0].content;
      currentFailures = combined;
      out.files = files.map((f) => f.path);
    } else {
      log.debug(`repair ${target.path}: attempt ${attempt} made things worse (${worst} > ${best}); discarded`);
      out.history.push({ attempt, discarded: true });
      continue;
    }

    // Only persist an attempt that did not regress.
    for (const f of files) await onFiles?.([f]);
  }

  out.pass = best === 0;
  out.remaining = best;
  out.improved = initial - best;
  if (!out.pass) {
    say?.('log', { level: 'warn', message: `${target.path} still has ${best} blocking issue(s) after ${out.attempts} attempt(s).` });
  }
  void cid;
  return out;
}
