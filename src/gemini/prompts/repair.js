import { SCHEMAS } from '../schema.js';

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

export function formatFailures(failures, { max = 40 } = {}) {
  const sorted = [...failures].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3),
  );
  const shown = sorted.slice(0, max);
  const lines = shown.map((f) => {
    const loc = f.line ? ` (line ${f.line})` : '';
    const hint = f.hint ? ` — ${f.hint}` : '';
    return `- [${f.severity ?? 'error'}] ${f.rule}: ${f.message}${loc}${hint}`;
  });
  if (sorted.length > shown.length) lines.push(`- …and ${sorted.length - shown.length} more.`);
  return lines.join('\n');
}

/**
 * Static (no-browser) repair.
 * Scope is deliberately one file: a repair that rewrites good files is how
 * generated sites oscillate instead of converging.
 */
export function repairPrompt({ plan, design, skills, target, content, failures, attempt, maxAttempts }) {
  return `Fix one broken file. This is repair attempt ${attempt} of ${maxAttempts}.

FILE
path: ${target.path}
kind: ${target.kind ?? 'page'}
purpose: ${target.description ?? 'Part of the site.'}

CURRENT CONTENT
\`\`\`
${content ?? '(empty)'}
\`\`\`

VALIDATION FAILURES — every one of these must be gone
${formatFailures(failures)}

CONTEXT YOU MUST NOT BREAK
site plan: ${JSON.stringify(plan ?? {}, null, 2)}
design tokens: ${JSON.stringify(design?.palette ?? {}, null, 2)}
${(skills ?? []).length ? `design skills in force: ${(skills ?? []).join(', ')}` : ''}
${
  (failures ?? []).some((f) => f.rule === 'broken-link' || f.rule === 'missing-file')
    ? '\nFiles that DO exist: you may only link to these. For anything else, remove the link or point it at an existing anchor.\n' + planSummary(plan)
    : ''
}

HOW TO FIX
- Address the failures literally. Do not reformat, rename classes, or rewrite working code.
- A file that fails a check because it is too long is fixed by removing filler, not by adding a comment.
- A file that fails because a referenced file does not exist is fixed by removing the reference or by emitting that file.
- If a failure cannot be fixed without violating the hard requirements, still fix everything you can.
- Return complete file contents. Never a diff, never a patch, never a fragment.

Return only the JSON object with "files": [{ "path": "${target.path}", "content": "..." }] and "fixesApplied": [...].`;
}

/** Browser-level repair. Only fires when static checks are clean but QA is not. */
export function qaRepairPrompt({ plan, design, skills, target, content, qa, attempt, maxAttempts }) {
  return `The file below passes static validation but fails a real browser check. Fix it.

This is QA repair attempt ${attempt} of ${maxAttempts}.

FILE
path: ${target.path}

CURRENT CONTENT
\`\`\`
${content}
\`\`\`

BROWSER QA RESULTS
${formatFailures(qa)}

WHAT THESE MEAN
- "console-error": the page throws at runtime. Find the undefined variable, the null querySelector, or the missing element and remove the cause. Every DOM query must be null-checked.
- "missing-anchor": a control exists but nothing is wired to it. Wire it to a real handler in app.js (return app.js too) or remove the control.
- "overflow-<width>px": the page scrolls horizontally at that width. Find the element wider than the viewport — usually a fixed-width child, a long unbroken string, or a grid that does not collapse — and fix it with min-width: 0, overflow-wrap, or a responsive rule.
- "no-focus-visible": a focusable element has no visible focus ring. Add it using the existing :focus-visible rule or a new one.
- "axe-<rule>": a real accessibility violation, per the WCAG guidance in the axe output. Fix the markup, not the symptom.
- "no-reduced-motion": animation is not neutralised. Add or complete the prefers-reduced-motion block.

site plan: ${JSON.stringify(plan ?? {}, null, 2)}
design tokens: ${JSON.stringify(design?.palette ?? {}, null, 2)}
${(skills ?? []).length ? `design skills in force: ${(skills ?? []).join(', ')}` : ''}

Return only the JSON object with "files": [{ "path": "${target.path}", "content": "..." }] and "fixesApplied": [...].`;
}

function planSummary(plan) {
  return (plan?.files ?? []).map((f) => `- ${f.path}`).join('\n');
}

export function seoRepairPrompt({ plan, pages, currentFiles }) {
  return `Write the SEO and metadata files for this site. These were missing or invalid.

SITE PLAN
${JSON.stringify(plan ?? {}, null, 2)}

PAGES
${JSON.stringify(pages ?? [], null, 2)}

FILES THAT EXIST
${(currentFiles ?? []).map((f) => `- ${f.path}`).join('\n')}

Return only the JSON object with "files", each with "path" and "content":
- sitemap.xml: one <url> per page in the plan, absolute https://example.com/ URLs, lastmod as a real ISO date.
- robots.txt: allow all, reference the sitemap, no nonsense.
- site.webmanifest: name, short_name, start_url, display standalone, a background_color and theme_color from the palette, and an icons array pointing at favicon.svg.
- .nojekyll: (if you produce it) exactly the text "true" with no extension.

Only produce files from that list.`;
}

export { SCHEMAS };
