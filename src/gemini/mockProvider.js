/**
 * Mock provider.
 *
 * Lets the entire pipeline — prompts, streaming, validation, repair, inlining,
 * QA, bundling, deploying — run with no API key. It answers each stage with the
 * same schema-valid JSON the live model is asked for, generated from the real
 * fixture templates. It is never a stub of the pipeline; only of the network.
 */
import {
  inferBrief, buildPlan, buildDesign, buildStyles, buildScript, buildPage,
  buildFavicon, buildOgImage, buildRobots, buildSitemap, buildManifest,
} from './fixtures.js';

const json = (value) => JSON.stringify(value);

function extractBrief(prompt) {
  const m = prompt.match(/BRIEF\s*\n"""\n([\s\S]*?)\n"""/);
  return m ? m[1].trim() : String(prompt).slice(0, 400).trim();
}

function extractOptions(prompt) {
  const m = prompt.match(/USER OPTIONS\s*\n([\s\S]*?)\n\n/);
  if (!m) return {};
  try {
    return JSON.parse(m[1]);
  } catch {
    return {};
  }
}

function extractJsonAfter(prompt, label) {
  const idx = prompt.indexOf(label);
  if (idx === -1) return null;
  const rest = prompt.slice(idx + label.length);
  const start = rest.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < rest.length; i++) {
    const ch = rest[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(rest.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractTargetPath(prompt) {
  const m =
    prompt.match(/Write ONE file:\s*(\S+)/) ??
    prompt.match(/Write the asset file:\s*(\S+)/) ??
    prompt.match(/^path:\s*(\S+)$/m);
  return m?.[1] ?? null;
}

/** Removes markdown fences a model might wrap code in. */
function unfence(code) {
  return String(code ?? '')
    .replace(/^```[a-zA-Z0-9]*\n?/, '')
    .replace(/```\s*$/, '')
    .replace(/\s+$/, '\n');
}

export function createMockProvider() {
  return {
    respond({ prompt }) {
      const p = String(prompt);
      const brief = extractBrief(p);
      const options = extractOptions(p);

      /* ---- analyze ---- */
      if (/triaging a website request/i.test(p)) {
        return { text: json(inferBrief(brief)), usage: usage(900, 700) };
      }

      /* ---- plan ---- */
      if (/Plan a complete static website/i.test(p)) {
        const triage = extractJsonAfter(p, 'TRIAGE (already decided') ?? inferBrief(brief);
        const plan = buildPlan(triage, options);
        return { text: json(plan), usage: usage(1400, 2600) };
      }

      /* ---- design ---- */
      if (/Lock the design system/i.test(p)) {
        const triage = extractJsonAfter(p, 'TRIAGE\n') ?? inferBrief(brief);
        const plan = extractJsonAfter(p, 'SITE PLAN\n') ?? buildPlan(triage, options);
        return { text: json(buildDesign(triage, plan)), usage: usage(1200, 2400) };
      }

      /* ---- stylesheet ---- */
      if (/Write the ONE stylesheet/i.test(p)) {
        const plan = extractJsonAfter(p, 'LOCKED SITE PLAN\n') ?? buildPlan(inferBrief(brief), options);
        const design = buildDesign(inferBrief(brief), plan);
        return {
          text: json({ files: [{ path: 'styles.css', content: unfence(buildStyles(plan, design)) }] }),
          usage: usage(1500, 9000),
        };
      }

      /* ---- shared script ---- */
      if (/Write the ONE script/i.test(p)) {
        return {
          text: json({ files: [{ path: 'app.js', content: unfence(buildScript()) }], notes: 'Shared behaviour for every page.' }),
          usage: usage(1200, 5000),
        };
      }

      /* ---- one page (checked before assets: both mention a path) ---- */
      if (/Write ONE file:/i.test(p)) {
        const path = extractTargetPath(p) ?? 'index.html';
        const plan = extractJsonAfter(p, 'LOCKED SITE PLAN\n') ?? buildPlan(inferBrief(brief), options);
        const design = buildDesign(inferBrief(brief), plan);
        const index = plan.pages.findIndex((pg) => pg.path === path);
        const page = index >= 0 ? plan.pages[index] : plan.pages[0];
        return {
          text: json({ files: [{ path, content: unfence(buildPage(plan, design, page)) }], notes: `${path} written.` }),
          usage: usage(1800, 7000),
        };
      }

      /* ---- asset / seo files ---- */
      const target = extractTargetPath(p);
      if (target) {
        const plan = extractJsonAfter(p, 'SITE PLAN\n') ?? buildPlan(inferBrief(brief), options);
        const design = buildDesign(inferBrief(brief), plan);
        return { text: json({ files: [{ path: target, content: unfence(buildAsset(target, plan, design)) }] }), usage: usage(600, 1400) };
      }

      /* ---- repair ---- */
      if (/Fix one broken file/i.test(p) || /fails a real browser check/i.test(p)) {
        const path = target ?? 'index.html';
        const current = extractFenced(p);
        return {
          text: json({ files: [{ path, content: unfence(current) }], fixesApplied: ['Removed dead link targets and rebalanced heading levels.'] }),
          usage: usage(1400, 3000),
        };
      }

      /* ---- edit ---- */
      if (/APPLY AN EDIT/i.test(p)) {
        const plan = extractJsonAfter(p, 'SITE PLAN (do not violate') ?? buildPlan(inferBrief(brief), options);
        const files = extractCurrentFiles(p);
        return {
          text: json({
            summary: `Applied the requested change to ${files[0]?.path ?? 'index.html'}.`,
            changes: files.slice(0, 2).map((f) => ({ path: f.path, content: f.content, reason: 'Matches the requested change.' })),
            assets: [],
          }),
          usage: usage(2600, 5000),
        };
      }

      return { text: json({ files: [], notes: 'mock: nothing to do' }), usage: usage(120, 80) };
    },
  };
}

function buildAsset(path, plan, design) {
  switch (path) {
    case 'favicon.svg':
      return buildFavicon(plan, design);
    case 'og-image.svg':
      return buildOgImage(plan, design);
    case 'robots.txt':
      return buildRobots();
    case 'sitemap.xml':
      return buildSitemap(plan);
    case 'site.webmanifest':
      return buildManifest(plan, design);
    default:
      return '';
  }
}

function extractFenced(prompt) {
  const m = prompt.match(/CURRENT CONTENT\s*\n```\n([\s\S]*?)\n```/);
  return m ? m[1] : '';
}

function extractCurrentFiles(prompt) {
  const marker = 'READ THESE FILES IN FULL BEFORE YOU DECIDE';
  const idx = prompt.indexOf(marker);
  if (idx === -1) return [];
  const rest = prompt.slice(idx + marker.length);
  const re = /\n--- ([\w./-]+) ---\n([\s\S]*?)(?=\n--- [\w./-]+ ---|\nRULES\n)/g;
  const out = [];
  let m;
  while ((m = re.exec(rest))) out.push({ path: m[1], content: m[2] });
  return out;
}

function usage(promptTokens, candidateTokens) {
  return {
    promptTokenCount: promptTokens,
    candidatesTokenCount: candidateTokens,
    totalTokenCount: promptTokens + candidateTokens,
  };
}
